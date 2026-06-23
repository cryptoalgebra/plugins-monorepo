// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';

import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';
import '../../interfaces/IAlgebraUpgradeablePlugin.sol';
import '../../interfaces/IAlgebraDefaultPluginFactory.sol';

/// @title Mock Factory for testing upgradeable plugins with Beacon Proxy pattern
/// @notice Matches prod AlgebraUpgradeablePluginFactory architecture for comprehensive testing
/// @dev Uses Transparent Upgradeable Proxy pattern with ERC-7201 namespaced storage
contract NewMockTimeUpgradeablePluginFactory is Initializable, IAlgebraDefaultPluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  // ========== ERC-7201 Namespaced Storage ==========

  /// @custom:storage-location erc7201:algebra.mockpluginfactory.storage
  struct PluginFactoryStorage {
    // Core
    address algebraFactory;
    address beacon;
    mapping(address pool => address plugin) pluginByPool;
    // Farming
    address farmingAddress;
    // Security
    address securityRegistry;
    // ALM
    address defaultRebalanceManager;
    uint32 defaultSlowTwapPeriod;
    uint32 defaultFastTwapPeriod;
    // Module implementations (for creating beacon)
    address volatilityOracleImplementation;
    address farmingProxyImplementation;
    address securityImplementation;
  }

  bytes32 private constant STORAGE_LOCATION = keccak256('algebra.mockpluginfactory.storage');

  function _getStorage() private pure returns (PluginFactoryStorage storage s) {
    bytes32 loc = STORAGE_LOCATION;
    assembly {
      s.slot := loc
    }
  }

  // ========== Constructor & Initializer ==========

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /// @notice Initialize the factory
  /// @param _algebraFactory The Algebra factory address
  /// @param pluginImplementation The plugin implementation address (MockTimeAlgebraUpgradeablePlugin)
  function initialize(
    address _algebraFactory,
    address pluginImplementation
  ) external initializer {
    PluginFactoryStorage storage s = _getStorage();
    s.algebraFactory = _algebraFactory;

    // Create beacon with provided implementation
    s.beacon = address(new UpgradeableBeacon(pluginImplementation));
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
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {}

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    PluginFactoryStorage storage s = _getStorage();
    IAlgebraFactory factory = IAlgebraFactory(s.algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool);
  }

  /// @notice Set plugin for pool (test helper)
  function setPluginForPool(address pool, address plugin) external {
    _getStorage().pluginByPool[pool] = plugin;
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    PluginFactoryStorage storage s = _getStorage();
    if (s.pluginByPool[pool] != address(0)) revert PluginAlreadyCreated();

    // Create proxy with empty init data
    plugin = address(new AlgebraPluginProxy(s.beacon, pool, ''));

    // Initialize plugin with pool address and all configurations
    IAlgebraUpgradeablePlugin(plugin).initialize(s.securityRegistry);

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


  // ========== Configuration Setters ==========

  /// @inheritdoc IFarmingPluginFactory
  function setFarmingAddress(address newFarmingAddress) external override {
    PluginFactoryStorage storage s = _getStorage();
    require(s.farmingAddress != newFarmingAddress);
    s.farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address newSecurityRegistry) external override {
    _getStorage().securityRegistry = newSecurityRegistry;
    emit SecurityRegistry(newSecurityRegistry);
  }

  // ========== Upgrade Management ==========

  /// @notice Upgrade all plugins to new implementation
  function upgradePlugins(address newImplementation) external {
    UpgradeableBeacon(_getStorage().beacon).upgradeTo(newImplementation);
  }

  /// @notice Get current implementation address
  function implementation() external view returns (address) {
    return UpgradeableBeacon(_getStorage().beacon).implementation();
  }
}
