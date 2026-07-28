// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IPermissionedPoolPlugin
/// @notice Public interface for the Permissioned Pool plugin module
interface IPermissionedPoolPlugin {
  /// @notice Emitted when the Permissions Adapter Factory is updated
  event PermissionsAdapterFactoryUpdated(address permissionsAdapterFactory);

  /// @notice Pool has no token with a verified PermissionsAdapter
  error NoVerifiedToken();

  /// @notice A token has a registered adapter that has not been governance-verified
  error UnverifiedTokenAdapter(address token);

  /// @notice The resolved real sender is not allowed for this token
  error NotAllowed(address token, address account);

  /// @notice Secondary trading has been disabled by the token issuer for this token
  error SwappingDisabled(address token);

  /// @notice A registered router reverted (or misbehaved) when asked for the real sender
  error RouterMsgSenderCallFailed();

  /// @notice Set the Permissions Adapter Factory address
  /// @param factory The new Permissions Adapter Factory address
  function setPermissionsAdapterFactory(address factory) external;

  /// @notice Get the current Permissions Adapter Factory address
  /// @return The Permissions Adapter Factory contract address
  function getPermissionsAdapterFactory() external view returns (address);
}
