// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../libraries/VolatilityOracle.sol';

/// @title IVolatilityOraclePluginImplementation
/// @notice Interface for VolatilityOracle plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in VolatilityOracleConnector
interface IVolatilityOraclePluginImplementation {
  function setInitialized(bool initialized) external;
  function setTimepointIndex(uint16 index) external;
  function setLastTimepointTimestamp(uint32 timestamp) external;
  function getIsInitialized() external view returns (bool);
  function getTimepointIndex() external view returns (uint16);
  function getLastTimepointTimestamp() external view returns (uint32);
  function getTimepoint(uint16 index) external view returns (VolatilityOracle.Timepoint memory);
  function setTimepoint(uint16 index, VolatilityOracle.Timepoint calldata timepoint) external;
  function initializeTimepoints(uint32 time, int24 tick) external;
  function initializeTWAP(uint32 time, int24 tick) external;
  function writeTimepointSimple(uint32 currentTimestamp, int24 tick) external;
  function getAverageVolatilityLast(
    uint32 currentTimestamp,
    int24 tick
  ) external view returns (uint88 volatilityAverage);
  function writeTimepoint(
    uint16 lastIndex,
    uint32 blockTimestamp,
    int24 tick
  ) external returns (uint16 indexUpdated, uint16 oldestIndex);
  function getOldestTimepointIndex(uint16 lastIndex) external view returns (uint16);
  function getSingleTimepointData(
    uint32 time,
    uint32 secondsAgo,
    int24 tick,
    uint16 lastIndex,
    uint16 oldestIndex
  ) external view returns (VolatilityOracle.Timepoint memory result);
  function getTimepointsData(
    uint32 currentTime,
    uint32[] calldata secondsAgos,
    int24 tick,
    uint16 lastIndex
  ) external view returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives);
  function getAverageVolatilityData(
    uint32 currentTime,
    int24 tick,
    uint16 lastIndex,
    uint16 oldestIndex
  ) external view returns (uint88);
  function prepayTimepointsSlots(uint16 startIndex, uint16 amount) external;
  function getTwapTick(
    uint32 period,
    int24 currentTick,
    uint32 currentTime
  ) external view returns (int24 timeWeightedAverageTick);
  function canGetTwap(uint32 period, uint32 currentTime) external view returns (bool);
}
