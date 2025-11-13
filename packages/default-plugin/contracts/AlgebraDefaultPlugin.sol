// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePlugin.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/alm-plugin/contracts/AlmPlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPlugin.sol';
import '@cryptoalgebra/limit-order-plugin/contracts/LimitOrderPlugin.sol';

/// @title Algebra Integral 1.2.2 adaptive fee, security and alm plugin
contract AlgebraDefaultPlugin is DynamicFeePlugin, FarmingProxyPlugin, VolatilityOraclePlugin, AlmPlugin, SecurityPlugin, LimitOrderPlugin {
  using Plugins for uint8;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    AlgebraFeeConfiguration memory _config,
    address _securityRegistry,
    address _limitOrderManager
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) DynamicFeePlugin(_config) SecurityPlugin(_securityRegistry) LimitOrderPlugin(_limitOrderManager) {}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128 liquidity, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24) {
    if (liquidity < 0) {
      _checkStatusOnBurn();
    } else {
      _checkStatus();
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24, uint24) {
    _writeTimepoint();
    _checkStatus();
    uint88 volatilityAverage = _getAverageVolatilityLast();
    uint24 fee = _getCurrentFee(volatilityAverage);
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }

  function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    if (rebalanceManager != address(0) && _ableToGetTimepoints(slowTwapPeriod)){
      ( , int24 currentTick, , ) = _getPoolState();
      uint32 lastBlockTimestamp = _getLastBlockTimestamp();

      int24 slowTwapTick = _getTwapTick(slowTwapPeriod);
      int24 fastTwapTick = _getTwapTick(fastTwapPeriod);

      _obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
    }

    _updateLimitOrderManagerState(pool, zeroToOne);
    
    _updateVirtualPoolTick(zeroToOne);

    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _checkStatus();
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function _getLastBlockTimestamp() private view returns (uint32 blockTimestamp) {
    VolatilityOracle.Timepoint memory lastTimepoint = timepoints[timepointIndex];
    return lastTimepoint.blockTimestamp;
  }

  function _getTwapTick(uint32 period) private view returns (int24 timeWeightedAverageTick) {
    require(period != 0, 'Period is zero');

    uint32[] memory secondAgos = new uint32[](2);
    secondAgos[0] = period;
    secondAgos[1] = 0;

    (, int24 tick, , ) = _getPoolState();
    (int56[] memory tickCumulatives, ) = timepoints.getTimepoints(_blockTimestamp(), secondAgos, tick, timepointIndex);

    int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

    timeWeightedAverageTick = int24(tickCumulativesDelta / int56(uint56(period)));

    // Always round to negative infinity
    if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(uint56(period)) != 0)) timeWeightedAverageTick--;
  }

  function _ableToGetTimepoints(uint32 period) private view returns (bool) {
    uint16 lastIndex = timepoints.getOldestIndex(timepointIndex);
    uint32 oldestTimestamp = timepoints[lastIndex].blockTimestamp;

    return VolatilityOracle._lteConsideringOverflow(oldestTimestamp, _blockTimestamp() - period, _blockTimestamp());
  }

  function getCurrentFee() external view override returns (uint16 fee) {
    uint88 volatilityAverage = _getAverageVolatilityLast();
    fee = _getCurrentFee(volatilityAverage);
  }
}
