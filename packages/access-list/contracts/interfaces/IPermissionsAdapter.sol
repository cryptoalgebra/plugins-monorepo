// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IPermissionsAdapter
/// @notice Per-token allowlist + emergency kill switch, managed by the token issuer.
/// @dev Registered against a specific `token` in PermissionsAdapterFactory. The trusted-wrapper
/// registry (`allowedWrappers`) is intentionally NOT here - it lives on the shared factory,
/// governed once for the whole ecosystem instead of per-issuer.
interface IPermissionsAdapter {
  event AccountAllowedUpdated(address indexed account, bool allowed);
  event SwappingEnabledUpdated(bool enabled);

  /// @notice The token this adapter gates
  function token() external view returns (address);

  /// @notice The address authorized to manage this adapter (the token issuer)
  function admin() external view returns (address);

  /// @notice Whether `account` is allowed to swap/add liquidity involving `token`
  function isAllowed(address account) external view returns (bool);

  /// @notice Emergency kill switch for secondary trading, independent of the allowlist
  /// @dev When false, blocks swap/flash involving `token` regardless of `isAllowed`.
  /// Does not affect add/remove liquidity.
  function swappingEnabled() external view returns (bool);

  /// @notice Add or remove a single account from the allowlist
  function setAllowed(address account, bool allowed) external;

  /// @notice Add or remove multiple accounts from the allowlist
  function setAllowedBatch(address[] calldata accounts, bool[] calldata allowed) external;

  /// @notice Enable or disable secondary trading for `token`
  function setSwappingEnabled(bool enabled) external;
}
