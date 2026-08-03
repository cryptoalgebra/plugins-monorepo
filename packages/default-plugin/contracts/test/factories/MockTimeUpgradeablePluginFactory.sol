// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

import '../plugins/MockTimeAlgebraUpgradeablePlugin.sol';
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';
import '../../interfaces/IAlgebraUpgradeablePlugin.sol';

/// @title Mock Factory for testing upgradeable plugins with Beacon Proxy pattern
/// @notice Creates MockTimeAlgebraUpgradeablePlugin instances using Beacon Proxy for testing
contract MockTimeUpgradeablePluginFactory is IFarmingPluginFactory, IBasePluginFactory {
  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  /// @notice The beacon that stores implementation address
  address public immutable beacon;

  /// @notice Address of VolatilityOracle implementation
  address public immutable volatilityOracleImplementation;

  /// @notice Address of DynamicFee implementation
  address public immutable dynamicFeeImplementation;

  /// @notice Address of FarmingProxy implementation
  address public immutable farmingProxyImplementation;

  /// @notice Address of ALM implementation
  address public immutable almImplementation;

  /// @notice Address of Security implementation
  address public immutable securityImplementation;

  /// @notice Default fee configuration
  AlgebraFeeConfiguration public defaultFeeConfiguration;

  /// @inheritdoc IBasePluginFactory
  mapping(address => address) public override pluginByPool;

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

  /// @notice Security registry address
  address public securityRegistry;

  constructor(
    address _algebraFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl,
    AlgebraFeeConfiguration memory _defaultFeeConfig
  ) {
    algebraFactory = _algebraFactory;
    volatilityOracleImplementation = _volatilityOracleImpl;
    dynamicFeeImplementation = _dynamicFeeImpl;
    farmingProxyImplementation = _farmingProxyImpl;
    almImplementation = _almImpl;
    securityImplementation = _securityImpl;
    defaultFeeConfiguration = _defaultFeeConfig;

    // Deploy beacon with MockTimeAlgebraUpgradeablePlugin implementation
    MockTimeAlgebraUpgradeablePlugin impl = new MockTimeAlgebraUpgradeablePlugin(
      _algebraFactory,
      address(this),
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      address(0)
    );
    beacon = address(new UpgradeableBeacon(address(impl)));
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory);
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool);
  }

  function setPluginForPool(address pool, address plugin) external {
    pluginByPool[pool] = plugin;
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    // Create proxy pointing to beacon
    plugin = address(new AlgebraPluginProxy(beacon, pool, ''));

    // Initialize plugin
    IAlgebraUpgradeablePlugin(plugin).initialize(defaultFeeConfiguration, securityRegistry, address(0));

    pluginByPool[pool] = plugin;
    return plugin;
  }

  /// @inheritdoc IFarmingPluginFactory
  function setFarmingAddress(address newFarmingAddress) external override {
    require(farmingAddress != newFarmingAddress);
    farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  function setSecurityRegistry(address _securityRegistry) external {
    securityRegistry = _securityRegistry;
  }

  // ========== Upgrade Management ==========

  /// @notice Upgrade all plugins to new implementation
  /// @param newImplementation Address of the new implementation
  function upgradePlugins(address newImplementation) external {
    UpgradeableBeacon(beacon).upgradeTo(newImplementation);
  }

  /// @notice Get current implementation address
  /// @return The current plugin implementation address
  function implementation() external view returns (address) {
    return UpgradeableBeacon(beacon).implementation();
  }
}
