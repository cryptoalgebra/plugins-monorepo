// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePlugin.sol';
import '@cryptoalgebra/sliding-fee-plugin/contracts/SlidingFeePlugin.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/lotus-plugin/contracts/ReflexAfterSwap.sol';

/// @title Algebra Integral 1.2.1 adaptive fee plugin
contract AlgebraDefaultPlugin is DynamicFeePlugin, SlidingFeePlugin, FarmingProxyPlugin, VolatilityOraclePlugin, ReflexAfterSwap {
  using Plugins for uint8;

  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig =
    uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG | Plugins.AFTER_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    AlgebraFeeConfiguration memory _config,
    address _reflexRouter,
    bytes32 _configId
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) DynamicFeePlugin(_config) SlidingFeePlugin(3000) ReflexAfterSwap(_reflexRouter, _configId) {}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external override onlyPool returns (bytes4, uint24) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address sender, address, bool, int256, uint160, bool, bytes calldata) external override onlyPool returns (bytes4, uint24, uint24) {
    _writeTimepoint();
    uint24 fee;
    if(sender == getRouter()){
      fee = 1;
    } else {
      /// calculate volatility and dynamic fee
      uint88 volatilityAverage = _getAverageVolatilityLast();
      fee = _getCurrentFee(volatilityAverage);
      
      /// calcucalate sliding fee based on dynamic fee
      fee = _getFeeAndUpdateFactors(zeroToOne, currentTick, lastTick, true, newFee);
    }
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }

  function afterSwap(
    address,
    address recipient,
    bool zeroToOne, 
    int256, 
    uint160, 
    int256 amount0Out,
    int256 amount1Out,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    _updateVirtualPoolTick(zeroToOne);
    bytes32 triggerPoolId = bytes32(uint256(uint160(msg.sender)));
    _reflexAfterSwap(triggerPoolId, amount0Out, amount1Out, zeroToOne, recipient);
    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function getCurrentFee() external view override returns (uint16 fee) {
    uint88 volatilityAverage = _getAverageVolatilityLast();
    fee = _getCurrentFee(volatilityAverage);
  }

  /// @inheritdoc ReflexAfterSwap
  function _onlyReflexAdmin() internal view override {
    _authorize();
  }
}
