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

  /// @notice Returns the minimum gas required before entering the MEVX after-swap path
  function getMinGasLeft() external view returns (uint256);

  /// @notice Returns the gas budget used for MEVX external calls
  function getCallGasBudget() external view returns (uint256);

  /// @notice Updates the configuration ID for profit distribution
  function setConfigId(bytes32 configId) external;

  /// @notice Updates the profit distributor address
  function setProfitDistributor(address profitDistributor) external;

  /// @notice Updates the MEVX executor address
  function setMevxExecutor(address mevxExecutor) external;

  /// @notice Updates the MEVX router address
  function setMevxRouter(address mevxRouter) external;

  /// @notice Updates the minimum gas required before entering the MEVX after-swap path
  function setMinGasLeft(uint256 minGasLeft) external;

  /// @notice Updates the gas budget used for MEVX external calls
  function setCallGasBudget(uint256 callGasBudget) external;
}
