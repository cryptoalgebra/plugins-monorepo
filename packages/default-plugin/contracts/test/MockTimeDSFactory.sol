// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

import './MockTimeAlgebraDefaultPlugin.sol';
import '../interfaces/IAlgebraDefaultPluginFactory.sol';

contract MockTimeDSFactory is IAlgebraDefaultPluginFactory {
  /// @inheritdoc IAlgebraDefaultPluginFactory
  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  /// @dev values of constants for sigmoids in fee calculation formula
  AlgebraFeeConfiguration public override defaultFeeConfiguration;

  /// @inheritdoc IBasePluginFactory
  mapping(address => address) public override pluginByPool;

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

  /// @inheritdoc ISecurityPluginFactory
  address public override securityRegistry;

  /// @notice Default router address used for new plugins
  address public override defaultRouter;

  /// @notice Default config ID used for new plugins
  bytes32 public override defaultConfigId;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
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

  function _createPlugin(address pool) internal returns (address) {
    MockTimeAlgebraDefaultPlugin volatilityOracle = new MockTimeAlgebraDefaultPlugin(
      pool,
      algebraFactory,
      address(this),
      defaultFeeConfiguration,
      securityRegistry,
      defaultRouter,
      defaultConfigId
    );
    pluginByPool[pool] = address(volatilityOracle);
    return address(volatilityOracle);
  }

  /// @inheritdoc IDynamicFeePluginFactory
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external override {
    AdaptiveFee.validateFeeConfiguration(newConfig);
    defaultFeeConfiguration = newConfig;
    emit DefaultFeeConfiguration(newConfig);
  }

  /// @inheritdoc IFarmingPluginFactory
  function setFarmingAddress(address newFarmingAddress) external override {
    require(farmingAddress != newFarmingAddress);
    farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address newSecurityRegistry) external override {
    securityRegistry = newSecurityRegistry;
    emit SecurityRegistry(newSecurityRegistry);
  }

  /// @notice Sets the default router address for new plugins
  /// @param newRouter The new router address to set
  function setRouter(address newRouter) external {
    defaultRouter = newRouter;
  }

  /// @notice Sets the default config ID for new plugins
  /// @param newConfigId The new config ID to set
  function setConfigId(bytes32 newConfigId) external {
    require(defaultConfigId != newConfigId, 'Same config ID');
    defaultConfigId = newConfigId;
    emit DefaultConfigId(newConfigId);
  }
}
