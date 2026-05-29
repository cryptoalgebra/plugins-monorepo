// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IAlgebraDefaultPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';
import './AlgebraDefaultPluginDeployer.sol';
import '@cryptoalgebra/mevx-plugin/contracts/MevxPlugin.sol';

/// @title Algebra Integral 1.2.2 default plugin factory
/// @notice This contract creates Algebra adaptive fee plugins for Algebra liquidity pools
/// @dev This plugin factory can only be used for Algebra default pools
contract AlgebraDefaultPluginFactory is IAlgebraDefaultPluginFactory {
  /// @inheritdoc IAlgebraDefaultPluginFactory
  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IDynamicFeePluginFactory
  AlgebraFeeConfiguration public override defaultFeeConfiguration; // values of constants for sigmoids in fee calculation formula

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

  /// @inheritdoc IBasePluginFactory
  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
    emit DefaultFeeConfiguration(defaultFeeConfiguration);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function createPlugin(address pool, address, address) external override returns (address) {
    require(msg.sender == algebraFactory);
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

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    AlgebraFeeConfiguration memory defaultFeeConfiguration_ = defaultFeeConfiguration;
    address pluginAddress = AlgebraDefaultPluginDeployer.deploy(
      pool,
      algebraFactory,
      address(this),
      defaultFeeConfiguration_,
      securityRegistry,
      MevxPlugin.MevxConfig({
        mevxRouter: defaultMevxRouter,
        mevxExecutor: defaultMevxExecutor,
        profitDistributor: defaultProfitDistributor,
        configId: defaultMevxConfigId,
        mevProtectionFeeEnabled: defaultMevProtectionFeeEnabled
      })
    );
    pluginByPool[pool] = pluginAddress;
    return pluginAddress;
  }

  /// @inheritdoc IDynamicFeePluginFactory
  function setDefaultFeeConfiguration(AlgebraFeeConfiguration calldata newConfig) external override onlyAdministrator {
    AdaptiveFee.validateFeeConfiguration(newConfig);
    defaultFeeConfiguration = newConfig;
    emit DefaultFeeConfiguration(newConfig);
  }

  /// @inheritdoc IFarmingPluginFactory
  function setFarmingAddress(address newFarmingAddress) external override onlyAdministrator {
    require(farmingAddress != newFarmingAddress);
    farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address newSecurityRegistry) external override onlyAdministrator {
    securityRegistry = newSecurityRegistry;
    emit SecurityRegistry(newSecurityRegistry);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxRouter(address newMevxRouter) external override onlyAdministrator {
    defaultMevxRouter = newMevxRouter;
    emit DefaultMevxRouter(newMevxRouter);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxExecutor(address newMevxExecutor) external override onlyAdministrator {
    defaultMevxExecutor = newMevxExecutor;
    emit DefaultMevxExecutor(newMevxExecutor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setProfitDistributor(address newProfitDistributor) external override onlyAdministrator {
    defaultProfitDistributor = newProfitDistributor;
    emit DefaultProfitDistributor(newProfitDistributor);
  }

  /// @inheritdoc IMevxPluginFactory
  function setMevxConfigId(bytes32 newConfigId) external override onlyAdministrator {
    defaultMevxConfigId = newConfigId;
    emit DefaultMevxConfigId(newConfigId);
  }

  /// @inheritdoc IMevxPluginFactory
  function setDefaultMevProtectionFeeEnabled(bool enabled) external override onlyAdministrator {
    defaultMevProtectionFeeEnabled = enabled;
    emit DefaultMevProtectionFeeEnabled(enabled);
  }
}
