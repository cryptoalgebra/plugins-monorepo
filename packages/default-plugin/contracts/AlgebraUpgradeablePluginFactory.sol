// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/mevx-plugin/contracts/interfaces/IMevxPluginFactory.sol';
import '@cryptoalgebra/whitelist-fee-discount-plugin/contracts/interfaces/IFeeDiscountPluginFactory.sol';
import '@cryptoalgebra/limit-order-plugin/contracts/interfaces/ILimitOrderPluginFactory.sol';

import './interfaces/IAlgebraUpgradeablePlugin.sol';
import './interfaces/IAlgebraDefaultPluginFactory.sol';

/// @title Algebra Upgradeable Plugin Factory
/// @notice Factory for deploying upgradeable plugins using Beacon Proxy pattern
/// @dev Uses Transparent Upgradeable Proxy pattern with ERC-7201 namespaced storage
/// @dev Deploy behind TransparentUpgradeableProxy from OpenZeppelin
contract AlgebraUpgradeablePluginFactory is Initializable, IAlgebraDefaultPluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @custom:storage-location erc7201:algebra.pluginfactory.storage
  struct PluginFactoryStorage {
    // Core
    address algebraFactory;
    address beacon;
    mapping(address pool => address plugin) pluginByPool;
    // Dynamic Fee
    AlgebraFeeConfiguration defaultFeeConfiguration;
    // Farming
    address farmingAddress;
    // Security
    address securityRegistry;

    // MevX
    address mevxRouter;
    address mevxExecutor;
    address profitDistributor;
    bytes32 mevxConfigId;

    // Fee Discount
    address feeDiscountRegistry;

    // Limit Orders
    address limitOrderManager;
  }

  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.pluginfactory.storage")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant STORAGE_LOCATION = 0x0e9f0474e886e912cb4b5069ff9005392033d95cf69dfd39d817b89628310400;

  function _getStorage() private pure returns (PluginFactoryStorage storage s) {
    bytes32 loc = STORAGE_LOCATION;
    assembly {
      s.slot := loc
    }
  }

  modifier onlyAdministrator() {
    if (!IAlgebraFactory(_getStorage().algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, msg.sender))
      revert OnlyAdministrator();
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice Initialize the factory
  /// @param _algebraFactory The Algebra factory address
  /// @param pluginImplementation The initial plugin implementation address
  /// @param initialFeeConfig The initial fee configuration
  function initialize(
    address _algebraFactory,
    address pluginImplementation,
    AlgebraFeeConfiguration memory initialFeeConfig
  ) external initializer {
    PluginFactoryStorage storage s = _getStorage();
    s.algebraFactory = _algebraFactory;
    s.beacon = address(new UpgradeableBeacon(pluginImplementation));

    // Validate and set initial fee configuration
    AdaptiveFee.validateFeeConfiguration(initialFeeConfig);
    s.defaultFeeConfiguration = initialFeeConfig;
    emit DefaultFeeConfiguration(initialFeeConfig);
  }

  // ========== IBasePluginFactory Implementation ==========

  /// @inheritdoc IBasePluginFactory
  function algebraFactory() external view override returns (address) {
    return _getStorage().algebraFactory;
  }

  /// @inheritdoc IBasePluginFactory
  function pluginByPool(address pool) external view override returns (address) {
    return _getStorage().pluginByPool[pool];
  }

  /// @notice The beacon that stores implementation address
  function beacon() external view returns (address) {
    return _getStorage().beacon;
  }

  // ========== Plugin Creation ==========

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    if (msg.sender != _getStorage().algebraFactory) revert OnlyAlgebraFactory();
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    if (msg.sender != _getStorage().algebraFactory) revert OnlyAlgebraFactory();
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    PluginFactoryStorage storage s = _getStorage();
    IAlgebraFactory factory = IAlgebraFactory(s.algebraFactory);
    if (!factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender)) revert OnlyPoolsAdministrator();

    address pool = factory.poolByPair(token0, token1);
    if (pool == address(0)) revert PoolNotExist();

    return _createPlugin(pool);
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    PluginFactoryStorage storage s = _getStorage();
    if (s.pluginByPool[pool] != address(0)) revert PluginAlreadyCreated();

    // Create proxy with empty init data (initialization happens separately)
    plugin = address(new AlgebraPluginProxy(s.beacon, pool, ''));

    // Initialize plugin with pool address and all configurations
    IAlgebraUpgradeablePlugin(plugin).initialize(
      s.defaultFeeConfiguration,
      s.securityRegistry,
      s.mevxRouter,
      s.mevxExecutor,
      s.profitDistributor,
      s.mevxConfigId,
      s.feeDiscountRegistry,
      s.limitOrderManager
    );

    s.pluginByPool[pool] = plugin;
    emit PluginCreated(pool, plugin);
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

  /// @inheritdoc IMevxPluginFactory
  function defaultMevxRouter() external view override returns (address) {
    return _getStorage().mevxRouter;
  }

  /// @inheritdoc IMevxPluginFactory
  function defaultMevxExecutor() external view override returns (address) {
    return _getStorage().mevxExecutor;
  }

  /// @inheritdoc IMevxPluginFactory
  function defaultProfitDistributor() external view override returns (address) {
    return _getStorage().profitDistributor;
  }

  /// @inheritdoc IMevxPluginFactory
  function defaultConfigId() external view override returns (bytes32) {
    return _getStorage().mevxConfigId;
  }

  /// @inheritdoc IFeeDiscountPluginFactory
  function feeDiscountRegistry() external view override returns (address) {
    return _getStorage().feeDiscountRegistry;
  }

  /// @notice Default limit order manager address
  function limitOrderManager() external view returns (address) {
    return _getStorage().limitOrderManager;
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
    PluginFactoryStorage storage s = _getStorage();
    if (s.farmingAddress == newFarmingAddress) revert FarmingAddressUnchanged();
    s.farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address newSecurityRegistry) external override onlyAdministrator {
    _getStorage().securityRegistry = newSecurityRegistry;
    emit SecurityRegistry(newSecurityRegistry);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxRouter(address newMevxRouter) external override onlyAdministrator {
    _getStorage().mevxRouter = newMevxRouter;
    emit DefaultMevxRouter(newMevxRouter);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxExecutor(address newMevxExecutor) external override onlyAdministrator {
    _getStorage().mevxExecutor = newMevxExecutor;
    emit DefaultMevxExecutor(newMevxExecutor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setProfitDistributor(address newProfitDistributor) external override onlyAdministrator {
    _getStorage().profitDistributor = newProfitDistributor;
    emit DefaultProfitDistributor(newProfitDistributor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setConfigId(bytes32 newConfigId) external override onlyAdministrator {
    _getStorage().mevxConfigId = newConfigId;
    emit DefaultConfigId(newConfigId);
  }

  /// @inheritdoc IFeeDiscountPluginFactory
  function setFeeDiscountRegistry(address newFeeDiscountRegistry) external override onlyAdministrator {
    _getStorage().feeDiscountRegistry = newFeeDiscountRegistry;
    emit FeeDiscountRegistry(newFeeDiscountRegistry);
  }

  /// @inheritdoc ILimitOrderPluginFactory
  function setLimitOrderManager(address newLimitOrderManager) external override onlyAdministrator {
    _getStorage().limitOrderManager = newLimitOrderManager;
    emit LimitOrderManager(newLimitOrderManager);
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
