// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMevxPlugin
interface IMevxPlugin {

  /// @notice Returns the current MEVX router address
  function getMevxRouter() external view returns (address);

  /// @notice Returns the current MEVX executor address
  function getMevxExecutor() external view returns (address);

  /// @notice Returns the current profit distributor address
  function getProfitDistributor() external view returns (address);

  /// @notice Returns the current configuration ID for profit distribution
  function getConfigId() external view returns (bytes32);

  /// @notice Updates the configuration ID for profit distribution
  function setConfigId(bytes32 configId) external;

  /// @notice Updates the profit distributor address
  function setProfitDistributor(address profitDistributor) external;

  /// @notice Updates the MEVX executor address
  function setMevxExecutor(address mevxExecutor) external;

  /// @notice Updates the MEVX router address
  function setMevxRouter(address mevxRouter) external;
}
