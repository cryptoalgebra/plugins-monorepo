// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the AccessListPluginFactory
interface IAccessListPluginFactory {
  /// @notice Emitted when the Access List registry address is changed
  /// @param accessListRegistry The Access List registry address after the address was changed
  event AccessListRegistry(address accessListRegistry);

  /// @notice Returns current accessListRegistry address
  /// @return The accessListRegistry contract address
  function accessListRegistry() external view returns (address);

  /// @dev updates Access List registry address on the factory
  /// @param newAccessListRegistry The new Access List registry contract address
  function setAccessListRegistry(address newAccessListRegistry) external;
}
