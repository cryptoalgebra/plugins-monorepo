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

  mapping(uint256 => AlgebraFeeConfiguration) public override feeConfigurations;

  /// @inheritdoc IBasePluginFactory
  mapping(address => address) public override pluginByPool;

  /// @inheritdoc IFarmingPluginFactory
  address public override farmingAddress;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
    defaultFeeConfiguration = AdaptiveFee.initialFeeConfiguration();
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata data) external override returns (address) {
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

  function setPluginForPool(address pool, address plugin) external {
    pluginByPool[pool] = plugin;
  }

  function _createPlugin(address pool, bytes calldata data) internal returns (address) {
    AlgebraFeeConfiguration memory feeConfig;
    if (data.length > 0){
      feeConfig = feeConfigurations[abi.decode(data, (uint256))];
    } else {
      feeConfig = defaultFeeConfiguration;
    }
    MockTimeAlgebraDefaultPlugin volatilityOracle = new MockTimeAlgebraDefaultPlugin(pool, algebraFactory, address(this), feeConfig);
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

  function setFeeConfiguration(uint256 index, AlgebraFeeConfiguration calldata config) external override  {
    AdaptiveFee.validateFeeConfiguration(config);
    feeConfigurations[index] = config;
  }
}
