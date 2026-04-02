// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAccessListPlugin
/// @notice Public interface for the Access List plugin module
/// @dev Uses tx.origin to identify users. Whitelist is managed in AccessListRegistry.
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
interface IAccessListPlugin {
  /// @notice Emitted when Access List registry is updated
  event AccessListRegistryUpdated(address registry);

  /// @notice The user (tx.origin) is not whitelisted in the access list
  error AccessListNotWhitelisted();

  /// @notice Set the Access List registry address
  /// @param registry The new Access List registry address
  function setAccessListRegistry(address registry) external;

  /// @notice Get the current Access List registry address
  /// @return The Access List registry contract address
  function getAccessListRegistry() external view returns (address);
}
