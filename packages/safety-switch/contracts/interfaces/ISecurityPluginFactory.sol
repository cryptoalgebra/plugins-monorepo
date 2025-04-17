// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the SecurityPluginFactory
interface ISecurityPluginFactory {
  /// @notice Emitted when the security registry address is changed
  /// @param securityRegistry The security registry address after the address was changed
  event SecurityRegistry(address securityRegistry);

  /// @notice Returns current securityRegistry address
  /// @return The securityRegistry contract address
  function securityRegistry() external view returns (address);

  /// @dev updates securoty registry address on the factory
  /// @param newSecurityRegistry The new security registry contract address
  function setSecurityRegistry(address newSecurityRegistry) external;
}
