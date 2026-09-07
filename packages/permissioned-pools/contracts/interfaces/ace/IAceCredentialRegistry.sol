// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAceCredentialRegistry
/// @notice Minimal subset of the Chainlink ACE CredentialRegistry interface
/// (https://github.com/smartcontractkit/chainlink-ace)
/// @dev Only the function used by the ACE allowlist checker is declared here. The upstream package is
/// licensed under BUSL-1.1 and is deliberately not taken as a dependency; this also avoids pragma
/// conflicts, matching how the OnchainID interfaces are vendored in this package.
interface IAceCredentialRegistry {
  /// @notice Check whether a CCID holds an unexpired credential of the given type
  /// @dev Upstream stores `expiresAt == 0` as "never expires". Specified as MUST NOT revert, but the
  /// checker still guards the call so a swap can never be bricked by a misconfigured registry.
  /// @param ccid The Cross-Chain Identifier
  /// @param credentialTypeId The ACE credential type hash, e.g. keccak256("common.kyc").
  /// This is the value the ACE platform returns as `credential_type_hash`, not the `credential_type_id` UUID
  /// @param context Optional context bytes forwarded to the registry
  /// @return True if the credential is present and still valid
  function validate(bytes32 ccid, bytes32 credentialTypeId, bytes calldata context) external view returns (bool);
}
