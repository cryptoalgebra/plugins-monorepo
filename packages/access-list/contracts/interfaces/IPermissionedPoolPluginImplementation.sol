// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IPermissionedPoolPluginImplementation
/// @notice Interface for Permissioned Pool plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in PermissionedPoolConnector.
interface IPermissionedPoolPluginImplementation {
  function initializePermissionedPool(address _permissionsAdapterFactory) external;
  function setPermissionsAdapterFactory(address _permissionsAdapterFactory) external;

  /// @notice Verify pool initialization - reverts unless at least one currency has a verified
  /// adapter, and any currency that has an adapter at all has a verified one
  /// @param pool The pool address
  function verifyInitialize(address pool) external view;

  /// @notice Verify a swap for both currencies independently - reverts if either currency has
  /// swapping disabled, or if the resolved real sender is not allowed for that currency
  /// @param pool The pool address
  /// @param sender The raw hook sender (the router/caller of the pool, not necessarily the real user)
  function verifySwap(address pool, address sender) external view;

  /// @notice Verify a flash loan - same checks as verifySwap
  /// @param pool The pool address
  /// @param sender The raw hook sender
  function verifyFlash(address pool, address sender) external view;

  /// @notice Verify an add-liquidity operation - allowlist only, swappingEnabled is not checked
  /// @param pool The pool address
  /// @param sender The raw hook sender
  function verifyAddLiquidity(address pool, address sender) external view;
}
