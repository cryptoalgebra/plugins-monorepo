// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IAbstractPlugin.sol';
import './interfaces/IVolatilityOracle.sol';

import './libraries/VolatilityOracle.sol';
import { BaseAbstractPlugin } from '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

/// @title Algebra Integral 1.2.1 VolatilityOraclePlugin plugin
/// @notice This contract stores timepoints and calculates adaptive fee and statistical averages
abstract contract VolatilityOraclePlugin is BaseAbstractPlugin, IVolatilityOracle {
  using Plugins for uint8;

  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  uint8 private constant defaultPluginConfig = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  /// @inheritdoc IVolatilityOracle
  VolatilityOracle.Timepoint[UINT16_MODULO] public override timepoints;

  /// @inheritdoc IVolatilityOracle
  uint16 public override timepointIndex;

  /// @inheritdoc IVolatilityOracle
  uint32 public override lastTimepointTimestamp;

  /// @inheritdoc IVolatilityOracle
  bool public override isInitialized;

  /// @inheritdoc IVolatilityOracle
  function initialize() external override {
    require(!isInitialized, 'Already initialized');
    require(_getPluginInPool() == address(this), 'Plugin not attached');
    (uint160 price, int24 tick, , ) = _getPoolState();
    require(price != 0, 'Pool is not initialized');
    _initialize_TWAP(tick);
  }

  function _initialize_TWAP(int24 tick) internal {
    uint32 time = _blockTimestamp();
    timepoints.initialize(time, tick);
    lastTimepointTimestamp = time;
    isInitialized = true;

    _enablePluginFlags(defaultPluginConfig);
  }
  // ###### Volatility and TWAP oracle ######

  /// @inheritdoc IVolatilityOracle
  function getSingleTimepoint(uint32 secondsAgo) external view override returns (int56 tickCumulative, uint88 volatilityCumulative) {
    // `volatilityCumulative` values for timestamps after the last timepoint _should not_ be compared: they may differ due to interpolation errors
    (, int24 tick, , ) = _getPoolState();
    uint16 lastTimepointIndex = timepointIndex;
    uint16 oldestIndex = timepoints.getOldestIndex(lastTimepointIndex);
    VolatilityOracle.Timepoint memory result = timepoints.getSingleTimepoint(_blockTimestamp(), secondsAgo, tick, lastTimepointIndex, oldestIndex);
    (tickCumulative, volatilityCumulative) = (result.tickCumulative, result.volatilityCumulative);
  }

  /// @inheritdoc IVolatilityOracle
  function getTimepoints(
    uint32[] memory secondsAgos
  ) external view override returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    // `volatilityCumulative` values for timestamps after the last timepoint _should not_ be compared: they may differ due to interpolation errors
    (, int24 tick, , ) = _getPoolState();
    return timepoints.getTimepoints(_blockTimestamp(), secondsAgos, tick, timepointIndex);
  }

  /// @inheritdoc IVolatilityOracle
  function prepayTimepointsStorageSlots(uint16 startIndex, uint16 amount) external override {
    require(!timepoints[startIndex].initialized); // if not initialized, then all subsequent ones too
    require(amount > 0 && type(uint16).max - startIndex >= amount);

    unchecked {
      for (uint256 i = startIndex; i < startIndex + amount; ++i) {
        timepoints[i].blockTimestamp = 1; // will be overwritten
      }
    }
  }

  function _writeTimepoint() internal {
    // single SLOAD
    uint16 _lastIndex = timepointIndex;
    uint32 _lastTimepointTimestamp = lastTimepointTimestamp;

    bool _isInitialized = isInitialized;
    require(_isInitialized, 'Not initialized');

    uint32 currentTimestamp = _blockTimestamp();
    if (_lastTimepointTimestamp == currentTimestamp) return;

    (, int24 tick, , ) = _getPoolState();
    (uint16 newLastIndex, ) = timepoints.write(_lastIndex, currentTimestamp, tick);

    timepointIndex = newLastIndex;
    lastTimepointTimestamp = currentTimestamp;
  }

  function _getAverageVolatilityLast() internal view returns (uint88 volatilityAverage) {
    uint32 currentTimestamp = _blockTimestamp();
    (, int24 tick, , ) = _getPoolState();

    uint16 lastTimepointIndex = timepointIndex;
    uint16 oldestIndex = timepoints.getOldestIndex(lastTimepointIndex);

    volatilityAverage = timepoints.getAverageVolatility(currentTimestamp, tick, lastTimepointIndex, oldestIndex);
  }

  function _getLastTick() internal view returns (int24 lastTick) {
    VolatilityOracle.Timepoint memory lastTimepoint = timepoints[timepointIndex];
    return lastTimepoint.tick;
  }

  function _getLastBlockTimestamp() internal view returns (uint32 blockTimestamp) {
    VolatilityOracle.Timepoint memory lastTimepoint = timepoints[timepointIndex];
    return lastTimepoint.blockTimestamp;
  }

  function _getTwapTick(uint32 period) internal view returns (int24 timeWeightedAverageTick) {
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

  function _ableToGetTimepoints(uint32 period) internal view returns (bool) {
    uint16 lastIndex = timepoints.getOldestIndex(timepointIndex);
    uint32 oldestTimestamp = timepoints[lastIndex].blockTimestamp;

    return VolatilityOracle._lteConsideringOverflow(oldestTimestamp, _blockTimestamp() - period, _blockTimestamp());
  }
}