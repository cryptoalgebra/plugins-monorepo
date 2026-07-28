// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IMsgSender
/// @notice Trusted self-reporting interface that routers/wrappers must implement so that
/// permissioned-pool checks can resolve the real end-user instead of trusting `tx.origin`
/// or the raw hook `sender` (which is only ever the immediate caller of the pool, e.g. a router).
/// @dev A contract's `msgSender()` report is only trusted by PermissionedPoolPluginImplementation
/// if that contract is separately registered as an allowed wrapper in PermissionsAdapterFactory.
/// Implementing this interface alone grants no trust - it must be paired with that registration.
interface IMsgSender {
  /// @notice Returns the address this router considers to be the real initiator of the current call
  /// @return The real end-user address, as reported by the router itself
  function msgSender() external view returns (address);
}
