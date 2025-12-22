// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './libraries/VolatilityOracle.sol';
import './libraries/VolatilityOracleStorage.sol';
import './interfaces/IVolatilityOraclePluginImplementation.sol';

/// @title VolatilityOracle Plugin Implementation
/// @notice This contract contains state management logic for VolatilityOracle plugin using namespaced storage
contract VolatilityOraclePluginImplementation is IVolatilityOraclePluginImplementation {
  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  /// @notice Initialize TWAP oracle
  /// @param time The initialization timestamp
  /// @param tick The initial tick
  function initializeTWAP(uint32 time, int24 tick) external {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    layout.timepoints.initialize(time, tick);
    layout.lastTimepointTimestamp = time;
    layout.isInitialized = true;
  }

  /// @notice Write timepoint
  /// @param currentTimestamp Current block timestamp
  /// @param tick Current tick from pool
  function writeTimepoint(uint32 currentTimestamp, int24 tick) external {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();

    require(layout.isInitialized, 'Not initialized');
    if (layout.lastTimepointTimestamp == currentTimestamp) return;

    (uint16 newLastIndex, ) = layout.timepoints.write(layout.timepointIndex, currentTimestamp, tick);

    layout.timepointIndex = newLastIndex;
    layout.lastTimepointTimestamp = currentTimestamp;
  }

  /// @notice Prepay storage slots for timepoints
  /// @param startIndex Start index for prepayment
  /// @param amount Number of slots to prepay
  function prepayTimepointsSlots(uint16 startIndex, uint16 amount) external {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    require(!layout.timepoints[startIndex].initialized, 'Already initialized');
    require(amount > 0 && type(uint16).max - startIndex >= amount, 'Invalid amount');

    unchecked {
      for (uint256 i = startIndex; i < startIndex + amount; ++i) {
        layout.timepoints[i].blockTimestamp = 1; // will be overwritten
      }
    }
  }

  // ============ TWAP Tick Calculation for ALM ============

  /// @notice Get TWAP tick for a given period
  /// @dev Used by ALM module to calculate time-weighted average tick
  /// @param period Number of seconds in the past
  /// @param currentTick Current pool tick
  /// @param currentTime Current block timestamp
  /// @return timeWeightedAverageTick The time-weighted average tick
  function getTwapTick(uint32 period, int24 currentTick, uint32 currentTime) external view returns (int24 timeWeightedAverageTick) {
    require(period != 0, 'Period is zero');

    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    // Get timepoint at current time (0 seconds ago)
    VolatilityOracle.Timepoint memory current = layout.timepoints.getSingleTimepoint(currentTime, 0, currentTick, lastIndex, oldestIndex);

    // Get timepoint at period seconds ago
    VolatilityOracle.Timepoint memory old = layout.timepoints.getSingleTimepoint(currentTime, period, currentTick, lastIndex, oldestIndex);

    int56 tickCumulativesDelta = current.tickCumulative - old.tickCumulative;
    timeWeightedAverageTick = int24(tickCumulativesDelta / int56(uint56(period)));

    if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(uint56(period)) != 0)) {
      timeWeightedAverageTick--;
    }
  }

  /// @notice Check if we can get TWAP for a given period
  /// @dev Used by ALM to check if enough history exists
  /// @param period The period in seconds
  /// @param currentTime Current block timestamp
  /// @return True if timepoints are available for the period
  function canGetTwap(uint32 period, uint32 currentTime) external view returns (bool) {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();

    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    // Get oldest timepoint timestamp
    uint32 oldestTimestamp = layout.timepoints[oldestIndex].blockTimestamp;

    // Check if the period is within available history (overflow-safe, matches legacy plugin semantics)
    return VolatilityOracle._lteConsideringOverflow(oldestTimestamp, currentTime - period, currentTime);
  }
}
