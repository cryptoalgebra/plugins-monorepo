// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@openzeppelin/contracts/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

import './interfaces/IAlgebraUpgradeablePlugin.sol';
import './interfaces/IAlgebraCustomPluginFactory.sol';

/// @title Algebra Custom Plugin Factory
/// @notice Custom pool deployer that creates upgradeable default plugins (Beacon Proxy) for its custom pools
/// @dev Pools are created and managed through the AlgebraCustomPoolEntryPoint
/// @dev Deploy behind TransparentUpgradeableProxy from OpenZeppelin
contract AlgebraCustomPluginFactory is Initializable, IAlgebraCustomPluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR = keccak256('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

  /// @custom:storage-location erc7201:algebra.custompluginfactory.storage
  struct CustomPluginFactoryStorage {
    // Core
    address algebraFactory;
    address entryPoint;
    address beacon;
    mapping(address pool => address plugin) pluginByPool;
    // Dynamic Fee
    AlgebraFeeConfiguration defaultFeeConfiguration;
    // Farming
    address farmingAddress;
    // Security
    address securityRegistry;
  }

  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.custompluginfactory.storage")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant STORAGE_LOCATION = 0xbf2e72b5c2acc9770f6c10f6be692a64b8f10a45dc8d92e9e88f9fde880f0400;

  function _getStorage() private pure returns (CustomPluginFactoryStorage storage s) {
    bytes32 loc = STORAGE_LOCATION;
    assembly {
      s.slot := loc
    }
  }

  modifier onlyAdministrator() {
    if (!IAlgebraFactory(_getStorage().algebraFactory).hasRoleOrOwner(ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR, msg.sender))
      revert OnlyAdministrator();
    _;
  }

  modifier onlyEntryPoint() {
    if (msg.sender != _getStorage().entryPoint) revert OnlyEntryPoint();
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice Initialize the factory
  /// @dev The Algebra factory is read from the entry point so role checks and pool creation cannot diverge
  /// @param _entryPoint The AlgebraCustomPoolEntryPoint address
  /// @param pluginImplementation The initial plugin implementation address
  /// @param initialFeeConfig The initial fee configuration
  function initialize(
    address _entryPoint,
    address pluginImplementation,
    AlgebraFeeConfiguration memory initialFeeConfig
  ) external initializer {
    CustomPluginFactoryStorage storage s = _getStorage();
    s.algebraFactory = IAlgebraCustomPoolEntryPoint(_entryPoint).factory();
    s.entryPoint = _entryPoint;
    s.beacon = address(new UpgradeableBeacon(pluginImplementation, address(this)));

    AdaptiveFee.validateFeeConfiguration(initialFeeConfig);
    s.defaultFeeConfiguration = initialFeeConfig;
    emit DefaultFeeConfiguration(initialFeeConfig);
  }

  // ========== Views ==========

  /// @inheritdoc IAlgebraCustomPluginFactory
  function algebraFactory() external view override returns (address) {
    return _getStorage().algebraFactory;
  }

  /// @inheritdoc ICustomPluginFactory
  function entryPoint() external view override returns (address) {
    return _getStorage().entryPoint;
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function pluginByPool(address pool) external view override returns (address) {
    return _getStorage().pluginByPool[pool];
  }

  /// @notice The beacon that stores implementation address
  function beacon() external view returns (address) {
    return _getStorage().beacon;
  }

  // ========== Custom Pool Creation ==========

  /// @inheritdoc ICustomPluginFactory
  function createCustomPool(
    address creator,
    address tokenA,
    address tokenB,
    bytes calldata data
  ) external override returns (address customPool) {
    return IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).createCustomPool(address(this), creator, tokenA, tokenB, data);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(
    address pool,
    address,
    address,
    address,
    address,
    bytes calldata
  ) external override onlyEntryPoint returns (address) {
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override onlyEntryPoint {}

  function _createPlugin(address pool) internal returns (address plugin) {
    CustomPluginFactoryStorage storage s = _getStorage();
    if (s.pluginByPool[pool] != address(0)) revert PluginAlreadyCreated();

    // Create proxy with empty init data (initialization happens separately)
    plugin = address(new AlgebraPluginProxy(s.beacon, pool, ''));

    IAlgebraUpgradeablePlugin(plugin).initialize(s.defaultFeeConfiguration, s.securityRegistry);

    s.pluginByPool[pool] = plugin;
    emit PluginCreated(pool, plugin);
  }

  // ========== Custom Pool Management ==========

  /// @inheritdoc ICustomPluginFactory
  function setTickSpacing(address pool, int24 newTickSpacing) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setTickSpacing(pool, newTickSpacing);
  }

  /// @inheritdoc ICustomPluginFactory
  function setPlugin(address pool, address newPluginAddress) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setPlugin(pool, newPluginAddress);
  }

  /// @inheritdoc ICustomPluginFactory
  function setPluginConfig(address pool, uint16 newConfig) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setPluginConfig(pool, newConfig);
  }

  /// @inheritdoc ICustomPluginFactory
  function setFee(address pool, uint16 newFee) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setFee(pool, newFee);
  }

  // ========== Configuration Getters ==========

  /// @inheritdoc IFarmingPluginFactory
  function farmingAddress() external view override returns (address) {
    return _getStorage().farmingAddress;
  }

  /// @inheritdoc ISecurityPluginFactory
  function securityRegistry() external view override returns (address) {
    return _getStorage().securityRegistry;
  }

  /// @inheritdoc IDynamicFeePluginFactory
  function defaultFeeConfiguration()
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    AlgebraFeeConfiguration memory config = _getStorage().defaultFeeConfiguration;
    return (config.alpha1, config.alpha2, config.beta1, config.beta2, config.gamma1, config.gamma2, config.baseFee);
  }

  // ========== Configuration Setters ==========

  /// @inheritdoc IDynamicFeePluginFactory
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external override onlyAdministrator {
    AdaptiveFee.validateFeeConfiguration(newConfig);
    _getStorage().defaultFeeConfiguration = newConfig;
    emit DefaultFeeConfiguration(newConfig);
  }

  /// @inheritdoc IFarmingPluginFactory
  function setFarmingAddress(address newFarmingAddress) external override onlyAdministrator {
    CustomPluginFactoryStorage storage s = _getStorage();
    if (s.farmingAddress == newFarmingAddress) revert FarmingAddressUnchanged();
    s.farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address newSecurityRegistry) external override onlyAdministrator {
    _getStorage().securityRegistry = newSecurityRegistry;
    emit SecurityRegistry(newSecurityRegistry);
  }

  // ========== Upgrade Management ==========

  /// @notice Upgrade all plugins to new implementation
  /// @param newImplementation Address of the new implementation
  function upgradePlugins(address newImplementation) external onlyAdministrator {
    UpgradeableBeacon(_getStorage().beacon).upgradeTo(newImplementation);
  }

  /// @notice Get current implementation address
  /// @return The current plugin implementation address
  function implementation() external view returns (address) {
    return UpgradeableBeacon(_getStorage().beacon).implementation();
  }
}
