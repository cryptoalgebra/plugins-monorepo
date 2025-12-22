// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IAlmPluginImplementation
/// @notice Interface for ALM plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in AlmConnector
interface IAlmPluginImplementation {
  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external;
  function setSlowTwapPeriod(uint32 _slowTwapPeriod) external;
  function setFastTwapPeriod(uint32 _fastTwapPeriod) external;
  function setRebalanceManager(address _rebalanceManager) external;
  function getRebalanceManager() external view returns (address);
  function getSlowTwapPeriod() external view returns (uint32);
  function getFastTwapPeriod() external view returns (uint32);
  function obtainTWAPAndRebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 lastBlockTimestamp) external;
}
