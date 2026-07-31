// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import { PermissionFlag } from '../libraries/PermissionFlags.sol';

/// @title IPermissionedPoolPlugin
/// @notice Public interface for the Permissioned Pool plugin module
/// @dev Resolves the real end-user via the two-level check (allowedRouters + IMsgSender),
/// never via tx.origin or the raw hook `sender`. See AllowlistCheckerRegistry for the
/// per-token checker registry and the shared trusted-router registry.
interface IPermissionedPoolPlugin {
  /// @notice Emitted when the Allowlist Checker Registry is updated
  event AllowlistCheckerRegistryUpdated(address allowlistCheckerRegistry);

  /// @notice Pool has no token with a checker assigned
  error NoPermissionedToken();

  /// @notice The resolved real sender is not allowed for this token and action
  error NotAllowed(address token, address account);

  /// @notice A registered router reverted (or misbehaved) when asked for the real sender
  error RouterMsgSenderCallFailed();

  /// @notice Check the permission flags for `account` with respect to `token` on this pool (for frontends)
  /// @dev Returns ALL_ALLOWED when the registry or the token's checker is unset (token unpermissioned)
  /// @param account The wallet address to check
  /// @param token One of this pool's tokens
  /// @return The permission flags reported by the token's checker
  function isTraderEligible(address account, address token) external view returns (PermissionFlag);

  /// @notice Set the Allowlist Checker Registry address
  /// @param registry The new Allowlist Checker Registry address
  function setAllowlistCheckerRegistry(address registry) external;

  /// @notice Get the current Allowlist Checker Registry address
  /// @return The Allowlist Checker Registry contract address
  function getAllowlistCheckerRegistry() external view returns (address);
}
