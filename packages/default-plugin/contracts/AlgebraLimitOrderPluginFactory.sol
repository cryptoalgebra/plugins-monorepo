// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IAlgebraLimitOrderPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';
import './AlgebraLimitOrderPlugin.sol';

/// @title Algebra Integral 1.2.1 default plugin factory
/// @notice This contract creates Algebra adaptive fee plugins for Algebra liquidity pools
/// @dev This plugin factory can only be used for Algebra default pools
contract AlgebraLimitOrderPluginFactory is IAlgebraLimitOrderPluginFactory {
  /// @inheritdoc IAlgebraLimitOrderPluginFactory
  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IDynamicFeePluginFactory
  AlgebraFeeConfiguration public override defaultFeeConfiguration; // values of constants for sigmoids in fee calculation formula

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

  /// @inheritdoc ISecurityPluginFactory
  address public override securityRegistry;

  /// @notice The address of the limit order manager
  address public limitOrderManager;

  /// @notice The address of the fee discount registry
  address public feeDiscountRegistry;

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
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == algebraFactory);
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

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    IDynamicFeeManager volatilityOracle = new AlgebraLimitOrderPlugin(
      pool, 
      algebraFactory, 
      address(this), 
      defaultFeeConfiguration, 
      limitOrderManager, 
      securityRegistry, 
      feeDiscountRegistry
    );
    pluginByPool[pool] = address(volatilityOracle);
    return address(volatilityOracle);
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

  /// @inheritdoc ILimitOrderPluginFactory
  function setLimitOrderManager(address newLimitOrderManager) external override onlyAdministrator {
    require(limitOrderManager != newLimitOrderManager);
    limitOrderManager = newLimitOrderManager;
    emit LimitOrderManager(newLimitOrderManager);
  }

  /// @inheritdoc ISecurityPluginFactory
  function setSecurityRegistry(address _securityRegistry) external override onlyAdministrator {
    require(securityRegistry != _securityRegistry);
    securityRegistry = _securityRegistry;
    emit SecurityRegistry(_securityRegistry);
  }

  /// @inheritdoc IFeeDiscountPluginFactory
  function setFeeDiscountRegistry(address _feeDiscountRegistry) external override onlyAdministrator {
    require(feeDiscountRegistry != _feeDiscountRegistry);
    feeDiscountRegistry = _feeDiscountRegistry;
    emit FeeDiscountRegistry(_feeDiscountRegistry);
  }
}
