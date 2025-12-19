// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IFarmingProxyPluginImplementation
/// @notice Interface for FarmingProxy plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in FarmingProxyConnector
interface IFarmingProxyPluginImplementation {
  function setIncentive(address newIncentive, address pluginFactory, address pool) external;
  function isIncentiveConnected(address targetIncentive, address pool) external view returns (bool);
  function updateVirtualPoolTick(bool zeroToOne, int24 tick) external;
}
