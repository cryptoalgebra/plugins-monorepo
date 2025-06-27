// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IAlgebraDefaultPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/libraries/AdaptiveFee.sol';
import './AlgebraDefaultPlugin.sol';

/// @title Algebra Integral 1.2.1 default plugin factory
/// @notice This contract creates Algebra adaptive fee plugins for Algebra liquidity pools
/// @dev This plugin factory can only be used for Algebra default pools
contract AlgebraDefaultPluginFactory is IAlgebraDefaultPluginFactory {
  /// @inheritdoc IAlgebraDefaultPluginFactory
  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  mapping(uint256 => AlgebraFeeConfiguration) public override feeConfigurations;

  /// @inheritdoc IDynamicFeePluginFactory
  AlgebraFeeConfiguration public override defaultFeeConfiguration;

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

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
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata data) external override returns (address) {
    require(msg.sender == algebraFactory);
    return _createPlugin(pool, data);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory);
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1, bytes calldata data) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool, data);
  }

  function _createPlugin(address pool, bytes calldata data) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    AlgebraFeeConfiguration memory feeConfig;
    if (data.length > 0){
      feeConfig = feeConfigurations[abi.decode(data, (uint256))];
    } else {
      feeConfig = defaultFeeConfiguration;
    }
 
    IDynamicFeeManager volatilityOracle = new AlgebraDefaultPlugin(pool, algebraFactory, address(this), feeConfig);
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

  function setFeeConfiguration(uint256 index, AlgebraFeeConfiguration calldata config) external override onlyAdministrator {
    AdaptiveFee.validateFeeConfiguration(config);
    feeConfigurations[index] = config;
  }
}
