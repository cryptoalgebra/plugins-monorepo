// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IAccessListPluginImplementation
/// @notice Interface for Access List plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in AccessListConnector.
/// All verification methods use tx.origin to identify the end-user.
interface IAccessListPluginImplementation {
  function initializeAccessList(address _accessListRegistry) external;
  function setAccessListRegistry(address _accessListRegistry) external;

  /// @notice Verify a swap — reverts if tx.origin is not whitelisted
  /// @param pool The pool address
  function verifySwap(address pool) external view;

  /// @notice Verify an add-liquidity operation — reverts if tx.origin is not whitelisted
  /// @param pool The pool address
  function verifyAddLiquidity(address pool) external view;

  /// @notice Verify a flash loan — reverts if tx.origin is not whitelisted
  /// @param pool The pool address
  function verifyFlash(address pool) external view;

  /// @notice Verify pool initialization — reverts if tx.origin is not whitelisted
  /// @param pool The pool address
  function verifyInitialize(address pool) external view;
}
