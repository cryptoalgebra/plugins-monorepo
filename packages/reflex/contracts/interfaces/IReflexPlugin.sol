// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReflexPlugin
interface IReflexPlugin {


  /// @notice Updates the Reflex router address
  /// @param router New router address to set
  function setReflexRouter(address router) external;

  /// @notice Returns the current router address
  /// @return The address of the current Reflex router contract
  function getRouter() external view returns (address);

  /// @notice Get the current configuration ID for profit distribution
  /// @return The current configuration ID
  function getConfigId() external view returns (bytes32);

  /// @notice Updates the configuration ID for profit distribution
  /// @param configId New configuration ID to set
  function setReflexConfigId(bytes32 configId) external;
}
