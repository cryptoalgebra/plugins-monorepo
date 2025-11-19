// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';

import './interfaces/IAlgebraCustomPluginFactory.sol';
import './AlgebraDefaultPlugin.sol';

/// @title Algebra Integral 1.2.1 ALM custom plugin deployer
contract AlgebraCustomPluginFactory is IAlgebraCustomPluginFactory {
  /// @inheritdoc IAlgebraCustomPluginFactory
  bytes32 public constant override ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR = keccak256('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

  /// @inheritdoc IAlgebraCustomPluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IAlgebraCustomPluginFactory
  address public immutable entryPoint;

  /// @inheritdoc IDynamicFeePluginFactory
  AlgebraFeeConfiguration public override defaultFeeConfiguration; // values of constants for sigmoids in fee calculation formula

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

  /// @inheritdoc ISecurityPluginFactory
  address public override securityRegistry;

  /// @notice Default router address used for new plugins
  address public override defaultRouter;

  /// @notice Default config ID used for new plugins
  bytes32 public override defaultConfigId;

  /// @inheritdoc IAlgebraCustomPluginFactory
  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory, address _entryPoint) {
    entryPoint = _entryPoint;
    algebraFactory = _algebraFactory;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == entryPoint);
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == entryPoint);
  }

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    address plugin = address(new AlgebraDefaultPlugin(
      pool,
      algebraFactory,
      address(this),
      defaultFeeConfiguration,
      securityRegistry,
      defaultRouter,
      defaultConfigId
    ));
    pluginByPool[pool] = plugin;
    return address(plugin);
  }
  
  /// @inheritdoc IAlgebraCustomPluginFactory
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external returns (address customPool) {
    return IAlgebraCustomPoolEntryPoint(entryPoint).createCustomPool(address(this), creator, tokenA, tokenB, data);
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

  /// @notice Sets the default router address for new plugins
  /// @param newRouter The new router address to set
  function setRouter(address newRouter) external onlyAdministrator {
    defaultRouter = newRouter;
  }

  /// @notice Sets the default config ID for new plugins
  /// @param newConfigId The new config ID to set
  function setConfigId(bytes32 newConfigId) external onlyAdministrator {
    require(defaultConfigId != newConfigId, 'Same config ID');
    defaultConfigId = newConfigId;
    emit DefaultConfigId(newConfigId);
  }

}