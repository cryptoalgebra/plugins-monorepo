// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IPermissionsAdapterFactory
/// @notice Registry distinguishing a *registered* PermissionsAdapter (self-serve, permissionless)
/// from a *verified* one (governance-approved) - a pool may only be initialized with a permissioned
/// currency once its adapter has been verified. Also holds the shared allowedWrappers registry used
/// by every permissioned pool to resolve the real sender behind a router.
interface IPermissionsAdapterFactory {
  event AdapterRegistered(address indexed token, address indexed adapter, address indexed registrar);
  event AdapterVerified(address indexed token, bool verified);
  event WrapperAllowedUpdated(address indexed wrapper, bool allowed);

  /// @notice The Algebra factory used for role-based access control
  function algebraFactory() external view returns (address);

  /// @notice Returns the adapter registered for `token`, or address(0) if none
  function getAdapter(address token) external view returns (address);

  /// @notice Whether the adapter currently registered for `token` has been governance-verified
  function isVerified(address token) external view returns (bool);

  /// @notice Whether `wrapper` is a governance-approved trusted router/relayer
  /// @dev Shared across all permissioned pools/adapters - approving a router once approves it everywhere.
  function allowedWrappers(address wrapper) external view returns (bool);

  /// @notice Register (or replace) the adapter for `token`
  /// @dev Callable only by the adapter's own admin (proves control of the adapter, not that the
  /// caller is the legitimate token issuer - that is what governance verification is for).
  /// Replacing an existing registration resets verification to false.
  function registerAdapter(address token, address adapter) external;

  /// @notice Governance approval/revocation of the adapter currently registered for `token`
  function verifyAdapter(address token, bool verified) external;

  /// @notice Governance approval/revocation of a trusted router/relayer
  function setWrapperAllowed(address wrapper, bool allowed) external;
}
