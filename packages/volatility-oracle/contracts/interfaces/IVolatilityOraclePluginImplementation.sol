// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IVolatilityOraclePluginImplementation
/// @notice Interface for VolatilityOracle plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in VolatilityOracleConnector
interface IVolatilityOraclePluginImplementation {
  function initializeTWAP(uint32 time, int24 tick) external;
  function writeTimepoint(uint32 currentTimestamp, int24 tick) external;
  function prepayTimepointsSlots(uint16 startIndex, uint16 amount) external;
  function getTwapTick(uint32 period, int24 currentTick, uint32 currentTime) external view returns (int24 timeWeightedAverageTick);
  function canGetTwap(uint32 period, uint32 currentTime) external view returns (bool);
}
