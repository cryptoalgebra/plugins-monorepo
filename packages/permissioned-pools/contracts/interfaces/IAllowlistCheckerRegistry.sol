// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAllowlistCheckerRegistry
/// @notice Governance-controlled registry of per-token IAllowlistChecker implementations, plus the
/// shared trusted-router registry used to resolve the real sender behind a router.
/// @dev Setting a checker for a token IS the governance approval — there is no separate
/// register/verify step. Only PERMISSIONED_POOL_MANAGER may point a token at a checker.
interface IAllowlistCheckerRegistry {
  event CheckerUpdated(address indexed token, address indexed checker);
  event RouterAllowedUpdated(address indexed router, bool allowed);

  /// @notice The Algebra factory used for role-based access control
  function algebraFactory() external view returns (address);

  /// @notice Returns the checker governance has set for `token`, or address(0) if none
  function getChecker(address token) external view returns (address);

  /// @notice Whether `router` is a governance-approved trusted router/relayer
  /// @dev Shared across all permissioned pools/checkers — approving a router once approves it everywhere.
  function allowedRouters(address router) external view returns (bool);

  /// @notice Set (or clear, with address(0)) the checker for `token`
  /// @dev Reverts unless `checker` reports support for IAllowlistChecker via ERC-165, or is address(0)
  function setChecker(address token, address checker) external;

  /// @notice Governance approval/revocation of a trusted router/relayer
  function setRouterAllowed(address router, bool allowed) external;
}
