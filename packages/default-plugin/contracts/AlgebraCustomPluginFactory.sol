// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

import './interfaces/IAlgebraUpgradeablePlugin.sol';
import './interfaces/IAlgebraCustomPluginFactory.sol';

/// @title Algebra Custom Plugin Factory
/// @notice Factory / custom-pool deployer that deploys upgradeable plugins (Beacon Proxy) for Algebra Integral
/// custom pools created through the AlgebraCustomPoolEntryPoint.
contract AlgebraCustomPluginFactory is Initializable, IAlgebraCustomPluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant override ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR = keccak256('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

  /// @dev Custom pools created by this factory use unit tick spacing.
  int24 public constant CUSTOM_POOL_TICK_SPACING = 1;

  /// @custom:storage-location erc7201:algebra.custompluginfactory.storage
  struct CustomPluginFactoryStorage {
    // Core
    address algebraFactory;
    address entryPoint;
    address beacon;
    mapping(address pool => address plugin) pluginByPool;
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

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice Initialize the factory
  /// @param _algebraFactory The Algebra factory address (used for role checks)
  /// @param _entryPoint The AlgebraCustomPoolEntryPoint address
  /// @param pluginImplementation The initial plugin implementation address
  function initialize(address _algebraFactory, address _entryPoint, address pluginImplementation) external initializer {
    CustomPluginFactoryStorage storage s = _getStorage();
    s.algebraFactory = _algebraFactory;
    s.entryPoint = _entryPoint;
    s.beacon = address(new UpgradeableBeacon(pluginImplementation));
  }

  // ========== Views ==========

  /// @inheritdoc IAlgebraCustomPluginFactory
  function algebraFactory() external view override returns (address) {
    return _getStorage().algebraFactory;
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function entryPoint() external view override returns (address) {
    return _getStorage().entryPoint;
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function pluginByPool(address pool) external view override returns (address) {
    return _getStorage().pluginByPool[pool];
  }

  /// @notice The beacon that stores the plugin implementation address
  function beacon() external view returns (address) {
    return _getStorage().beacon;
  }

  // ========== Custom Pool Creation ==========

  /// @inheritdoc IAlgebraCustomPluginFactory
  function createCustomPoolAndInitialize(
    address creator,
    address tokenA,
    address tokenB,
    uint160 sqrtPriceX96,
    bytes calldata data
  ) external override onlyAdministrator returns (address customPool) {
    address entryPointAddress = _getStorage().entryPoint;
    customPool = IAlgebraCustomPoolEntryPoint(entryPointAddress).createCustomPool(address(this), creator, tokenA, tokenB, data);
    IAlgebraPool(customPool).initialize(sqrtPriceX96);
    // Custom pools use unit tick spacing. Applied after initialization, while there is still no liquidity.
    IAlgebraCustomPoolEntryPoint(entryPointAddress).setTickSpacing(customPool, CUSTOM_POOL_TICK_SPACING);
  }

  /// @inheritdoc IAlgebraPluginFactory
  /// @dev Only the entry point creates pools for this deployer, so default-pool creation via the AlgebraFactory is
  /// intentionally not supported here.
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    if (msg.sender != _getStorage().entryPoint) revert OnlyEntryPoint();
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    if (msg.sender != _getStorage().entryPoint) revert OnlyEntryPoint();
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    CustomPluginFactoryStorage storage s = _getStorage();
    if (s.pluginByPool[pool] != address(0)) revert PluginAlreadyCreated();

    // Create proxy with empty init data (initialization happens separately)
    plugin = address(new AlgebraPluginProxy(s.beacon, pool, ''));

    // Initialize plugin with the security registry
    IAlgebraUpgradeablePlugin(plugin).initialize(s.securityRegistry);

    s.pluginByPool[pool] = plugin;
    emit PluginCreated(pool, plugin);
  }

  // ========== Custom Pool Management (routed through the entry point) ==========

  /// @inheritdoc IAlgebraCustomPluginFactory
  function setTickSpacing(address pool, int24 newTickSpacing) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setTickSpacing(pool, newTickSpacing);
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function setPlugin(address pool, address newPluginAddress) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setPlugin(pool, newPluginAddress);
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function setPluginConfig(address pool, uint8 newConfig) external override onlyAdministrator {
    IAlgebraCustomPoolEntryPoint(_getStorage().entryPoint).setPluginConfig(pool, newConfig);
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
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

  // ========== Configuration Setters ==========

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

  /// @notice Upgrade all plugins to a new implementation
  /// @param newImplementation Address of the new implementation
  function upgradePlugins(address newImplementation) external onlyAdministrator {
    UpgradeableBeacon(_getStorage().beacon).upgradeTo(newImplementation);
  }

  /// @notice Get the current plugin implementation address
  /// @return The current plugin implementation address
  function implementation() external view returns (address) {
    return UpgradeableBeacon(_getStorage().beacon).implementation();
  }
}
