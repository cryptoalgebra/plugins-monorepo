// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IPermissionedPoolPlugin
/// @notice Public interface for the Permissioned Pool plugin module
/// @dev Resolves the real end-user via the two-level check (allowedWrappers + IMsgSender),
/// never via tx.origin or the raw hook `sender`. See PermissionsAdapterFactory for the
/// registered/verified adapter registry and the shared trusted-wrapper registry.
interface IPermissionedPoolPlugin {
  /// @notice Emitted when the Permissions Adapter Factory is updated
  event PermissionsAdapterFactoryUpdated(address permissionsAdapterFactory);

  /// @notice Pool has no currency with a verified PermissionsAdapter
  error NoVerifiedCurrency();

  /// @notice A currency has a registered adapter that has not been governance-verified
  error UnverifiedCurrencyAdapter(address token);

  /// @notice The resolved real sender is not allowed for this currency
  error NotAllowed(address token, address account);

  /// @notice Secondary trading has been disabled by the token issuer for this currency
  error SwappingDisabled(address token);

  /// @notice A registered wrapper reverted (or misbehaved) when asked for the real sender
  error RouterMsgSenderCallFailed();

  /// @notice Set the Permissions Adapter Factory address
  /// @param factory The new Permissions Adapter Factory address
  function setPermissionsAdapterFactory(address factory) external;

  /// @notice Get the current Permissions Adapter Factory address
  /// @return The Permissions Adapter Factory contract address
  function getPermissionsAdapterFactory() external view returns (address);
}
