// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the PermissionedPoolPluginFactory
interface IPermissionedPoolPluginFactory {
  /// @notice Emitted when the default allowlist checker registry address is changed
  /// @param allowlistCheckerRegistry The allowlist checker registry address after the address was changed
  event AllowlistCheckerRegistry(address allowlistCheckerRegistry);

  /// @notice Returns the default allowlist checker registry address applied to newly created plugins
  /// @return The allowlist checker registry contract address
  function allowlistCheckerRegistry() external view returns (address);

  /// @dev Updates the default allowlist checker registry address on the factory
  /// @param newAllowlistCheckerRegistry The new allowlist checker registry contract address
  function setAllowlistCheckerRegistry(address newAllowlistCheckerRegistry) external;
}
