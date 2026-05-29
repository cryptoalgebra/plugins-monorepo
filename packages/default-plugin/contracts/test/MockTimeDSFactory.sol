// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

import './MockTimeAlgebraDefaultPlugin.sol';
import '@cryptoalgebra/mevx-plugin/contracts/MevxPlugin.sol';
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

  /// @inheritdoc IMevxPluginFactory
  address public override defaultMevxRouter;

  /// @inheritdoc IMevxPluginFactory
  address public override defaultMevxExecutor;

  /// @inheritdoc IMevxPluginFactory
  address public override defaultProfitDistributor;

  /// @inheritdoc IMevxPluginFactory
  bytes32 public override defaultMevxConfigId;

  /// @inheritdoc IMevxPluginFactory
  bool public override defaultMevProtectionFeeEnabled;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
  }

  /// @inheritdoc IAlgebraPluginFactory
  function createPlugin(address pool, address, address) external override returns (address) {
    return _createPlugin(pool);
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
      MevxPlugin.MevxConfig({
        mevxRouter: defaultMevxRouter,
        mevxExecutor: defaultMevxExecutor,
        profitDistributor: defaultProfitDistributor,
        configId: defaultMevxConfigId,
        mevProtectionFeeEnabled: defaultMevProtectionFeeEnabled
      })
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

  /// @inheritdoc IMevxPluginFactory
  function setMevxRouter(address newMevxRouter) external override {
    defaultMevxRouter = newMevxRouter;
    emit DefaultMevxRouter(newMevxRouter);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxExecutor(address newMevxExecutor) external override {
    defaultMevxExecutor = newMevxExecutor;
    emit DefaultMevxExecutor(newMevxExecutor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setProfitDistributor(address newProfitDistributor) external override {
    defaultProfitDistributor = newProfitDistributor;
    emit DefaultProfitDistributor(newProfitDistributor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxConfigId(bytes32 newConfigId) external override {
    defaultMevxConfigId = newConfigId;
    emit DefaultMevxConfigId(newConfigId);
  }

  /// @inheritdoc IMevxPluginFactory
  function setDefaultMevProtectionFeeEnabled(bool enabled) external override {
    defaultMevProtectionFeeEnabled = enabled;
    emit DefaultMevProtectionFeeEnabled(enabled);
  }
}
