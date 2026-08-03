// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IPermissionedPoolPluginImplementation
/// @notice Interface for Permissioned Pool plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in PermissionedPoolConnector.
interface IPermissionedPoolPluginImplementation {
  function initializePermissionedPool(address _allowlistCheckerRegistry) external;
  function setAllowlistCheckerRegistry(address _allowlistCheckerRegistry) external;
  function setRouterAllowed(address router, bool allowed) external;

  /// @notice Verify a swap for both tokens independently
  /// @dev Reverts unless the resolved real sender's checker flags include SWAP_ALLOWED for each token that has a checker
  /// @param pool The pool address
  /// @param sender The raw hook sender (the router/caller of the pool, not necessarily the real user)
  function verifySwap(address pool, address sender) external view;

  /// @notice Verify an add-liquidity operation
  /// @dev Reverts unless the resolved real sender's checker flags include LIQUIDITY_ALLOWED for each token that has a checker
  /// @param pool The pool address
  /// @param sender The raw hook sender
  function verifyAddLiquidity(address pool, address sender) external view;
}
