// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title ILimitOrderPluginImplementation
/// @notice Interface for LimitOrder plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in LimitOrderConnector
interface ILimitOrderPluginImplementation {
  function initializeLimitOrder(address limitOrderManager) external;
  function setLimitOrderManager(address manager) external;
  function getLimitOrderManager() external view returns (address);
  function updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) external;
}
