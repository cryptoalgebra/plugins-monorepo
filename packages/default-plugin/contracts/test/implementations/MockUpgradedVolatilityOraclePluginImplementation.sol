// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/volatility-oracle-plugin/contracts/libraries/VolatilityOracle.sol';

/// @title Mock Upgraded VolatilityOracle Plugin Implementation
contract MockUpgradedVolatilityOraclePluginImplementation {
  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  
  bytes32 internal constant VOLATILITY_ORACLE_STORAGE_SLOT = keccak256('algebra.storage.volatilityoracle');

  
  struct VolatilityOracleLayoutV2 {
    uint16 timepointIndex;
    uint32 lastTimepointTimestamp;
    bool isInitialized;
    VolatilityOracle.Timepoint[UINT16_MODULO] timepoints;
    // V2 fields (new)
    uint256 writeCount;         
    bool enhancedMode;          
  }

  
  function _getVolatilityOracleLayout() internal pure returns (VolatilityOracleLayoutV2 storage layout) {
    bytes32 position = VOLATILITY_ORACLE_STORAGE_SLOT;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize VolatilityOracle plugin state
  /// @dev Called via delegatecall from connector
  function initializeVolatilityOracleState() external {
    // Initial state is already zero-initialized
  }

  /// @notice Set initialized state
  /// @dev Called via delegatecall from connector
  /// @param initialized New initialized state
  function setInitialized(bool initialized) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.isInitialized = initialized;
  }

  /// @notice Set timepoint index
  /// @dev Called via delegatecall from connector
  /// @param index New timepoint index
  function setTimepointIndex(uint16 index) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.timepointIndex = index;
  }

  /// @notice Set last timepoint timestamp
  /// @dev Called via delegatecall from connector
  /// @param timestamp New timestamp
  function setLastTimepointTimestamp(uint32 timestamp) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.lastTimepointTimestamp = timestamp;
  }

  /// @notice Get initialized state
  /// @dev Called via staticcall from connector
  /// @return isInitialized Whether the oracle is initialized
  function getIsInitialized() external view returns (bool) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.isInitialized;
  }

  /// @notice Get timepoint index
  /// @dev Called via staticcall from connector
  /// @return index Current timepoint index
  function getTimepointIndex() external view returns (uint16) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepointIndex;
  }

  /// @notice Get last timepoint timestamp
  /// @dev Called via staticcall from connector
  /// @return timestamp Last timepoint timestamp
  function getLastTimepointTimestamp() external view returns (uint32) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.lastTimepointTimestamp;
  }

  // ============ Timepoints Array Operations ============

  /// @notice Get a single timepoint by index
  /// @dev Called via staticcall from connector
  /// @param index The index of the timepoint
  /// @return timepoint The timepoint data
  function getTimepoint(uint16 index) external view returns (VolatilityOracle.Timepoint memory) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepoints[index];
  }

  /// @notice Set a single timepoint by index
  /// @dev Called via delegatecall from connector
  /// @param index The index of the timepoint
  /// @param timepoint The timepoint data to set
  function setTimepoint(uint16 index, VolatilityOracle.Timepoint calldata timepoint) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.timepoints[index] = timepoint;
    // V2: Track writes
    layout.writeCount++;
  }

  /// @notice Initialize the timepoints array (write first timepoint)
  /// @dev Called via delegatecall from connector
  /// @param time The initialization timestamp
  /// @param tick The initial tick
  function initializeTimepoints(uint32 time, int24 tick) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.timepoints.initialize(time, tick);
  }

  /// @notice Initialize TWAP oracle - initializes timepoints and sets all state in one call
  /// @dev Equivalent to the original _initialize_TWAP in VolatilityOraclePlugin
  /// @param time The initialization timestamp
  /// @param tick The initial tick
  function initializeTWAP(uint32 time, int24 tick) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.timepoints.initialize(time, tick);
    layout.lastTimepointTimestamp = time;
    layout.isInitialized = true;
  }

  /// @notice Write timepoint with automatic state management
  /// @dev Equivalent to the original _writeTimepoint in VolatilityOraclePlugin
  /// @param currentTimestamp Current block timestamp
  /// @param tick Current tick from pool
  function writeTimepoint(uint32 currentTimestamp, int24 tick) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();

    require(layout.isInitialized, 'Not initialized');
    if (layout.lastTimepointTimestamp == currentTimestamp) return;

    (uint16 newLastIndex, ) = layout.timepoints.write(layout.timepointIndex, currentTimestamp, tick);

    layout.timepointIndex = newLastIndex;
    layout.lastTimepointTimestamp = currentTimestamp;
    // V2: Track writes
    layout.writeCount++;
  }

  /// @notice Get average volatility using current state
  /// @dev Equivalent to the original _getAverageVolatilityLast in VolatilityOraclePlugin
  /// @param currentTimestamp Current block timestamp
  /// @param tick Current tick from pool
  /// @return volatilityAverage The average volatility
  function getAverageVolatilityLast(
    uint32 currentTimestamp,
    int24 tick
  ) external view returns (uint88 volatilityAverage) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();

    uint16 lastTimepointIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastTimepointIndex);

    volatilityAverage = layout.timepoints.getAverageVolatility(currentTimestamp, tick, lastTimepointIndex, oldestIndex);
  }

  /// @notice Write a new timepoint to the array
  /// @dev Called via delegatecall from connector
  /// @param lastIndex The index of the last written timepoint
  /// @param blockTimestamp The timestamp of the new timepoint
  /// @param tick The tick value for the new timepoint
  /// @return indexUpdated The new index of the most recently written element
  /// @return oldestIndex The index of the oldest timepoint
  function writeTimepoint(
    uint16 lastIndex,
    uint32 blockTimestamp,
    int24 tick
  ) external returns (uint16 indexUpdated, uint16 oldestIndex) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    // V2: Track writes
    layout.writeCount++;
    return layout.timepoints.write(lastIndex, blockTimestamp, tick);
  }

  /// @notice Get oldest timepoint index
  /// @dev Called via staticcall from connector
  /// @param lastIndex The index of the last written timepoint
  /// @return oldestIndex The index of the oldest timepoint
  function getOldestTimepointIndex(uint16 lastIndex) external view returns (uint16) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepoints.getOldestIndex(lastIndex);
  }

  /// @notice Get single timepoint data
  /// @dev Called via staticcall from connector
  /// @param time Current block timestamp
  /// @param secondsAgo Seconds ago from current time
  /// @param tick Current tick
  /// @param lastIndex Last timepoint index
  /// @param oldestIndex Oldest timepoint index
  /// @return result The interpolated timepoint data
  function getSingleTimepointData(
    uint32 time,
    uint32 secondsAgo,
    int24 tick,
    uint16 lastIndex,
    uint16 oldestIndex
  ) external view returns (VolatilityOracle.Timepoint memory result) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepoints.getSingleTimepoint(time, secondsAgo, tick, lastIndex, oldestIndex);
  }

  /// @notice Get multiple timepoints data
  /// @dev Called via staticcall from connector
  /// @param currentTime Current block timestamp
  /// @param secondsAgos Array of seconds ago values
  /// @param tick Current tick
  /// @param lastIndex Last timepoint index
  /// @return tickCumulatives Array of tick cumulatives
  /// @return volatilityCumulatives Array of volatility cumulatives
  function getTimepointsData(
    uint32 currentTime,
    uint32[] calldata secondsAgos,
    int24 tick,
    uint16 lastIndex
  ) external view returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepoints.getTimepoints(currentTime, secondsAgos, tick, lastIndex);
  }

  /// @notice Get average volatility
  /// @dev Called via staticcall from connector
  /// @param currentTime Current block timestamp
  /// @param tick Current tick
  /// @param lastIndex Last timepoint index
  /// @param oldestIndex Oldest timepoint index
  /// @return volatilityAverage The average volatility
  function getAverageVolatilityData(
    uint32 currentTime,
    int24 tick,
    uint16 lastIndex,
    uint16 oldestIndex
  ) external view returns (uint88) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.timepoints.getAverageVolatility(currentTime, tick, lastIndex, oldestIndex);
  }

  /// @notice Prepay storage slots for timepoints
  /// @dev Called via delegatecall from connector
  /// @param startIndex Start index for prepayment
  /// @param amount Number of slots to prepay
  function prepayTimepointsSlots(uint16 startIndex, uint16 amount) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
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
  function getTwapTick(
    uint32 period,
    int24 currentTick,
    uint32 currentTime
  ) external view returns (int24 timeWeightedAverageTick) {
    if (period == 0) return currentTick;

    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    // Get timepoint at current time (0 seconds ago)
    VolatilityOracle.Timepoint memory current = layout.timepoints.getSingleTimepoint(
      currentTime,
      0,
      currentTick,
      lastIndex,
      oldestIndex
    );

    // Get timepoint at period seconds ago
    VolatilityOracle.Timepoint memory old = layout.timepoints.getSingleTimepoint(
      currentTime,
      period,
      currentTick,
      lastIndex,
      oldestIndex
    );

    int56 tickCumulativesDelta = current.tickCumulative - old.tickCumulative;
    timeWeightedAverageTick = int24(tickCumulativesDelta / int56(uint56(period)));

    // Always round to negative infinity
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
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();

    if (!layout.isInitialized) return false;
    if (period == 0) return true;

    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    // Get oldest timepoint timestamp
    uint32 oldestTimestamp = layout.timepoints[oldestIndex].blockTimestamp;

    // Check if the period is within available history
    return currentTime >= oldestTimestamp + period;
  }

  //  V2 NEW FUNCTIONS 

 
  function setEnhancedMode(bool enabled) external {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    layout.enhancedMode = enabled;
  }

  
  function getEnhancedMode() external view returns (bool) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.enhancedMode;
  }

  
  function getWriteStats() external view returns (uint256 writeCount) {
    VolatilityOracleLayoutV2 storage layout = _getVolatilityOracleLayout();
    return layout.writeCount;
  }

  
  function isUpgradedVolatilityImpl() external pure returns (bool) {
    return true;
  }
}