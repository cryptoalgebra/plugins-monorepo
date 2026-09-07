// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAceIdentityRegistry
/// @notice Minimal subset of the Chainlink ACE IdentityRegistry interface
/// (https://github.com/smartcontractkit/chainlink-ace)
/// @dev Only the function used by the ACE allowlist checker is declared here. The upstream package is
/// licensed under BUSL-1.1 and is deliberately not taken as a dependency; this also avoids pragma
/// conflicts, matching how the OnchainID interfaces are vendored in this package.
interface IAceIdentityRegistry {
  /// @notice Resolve the Cross-Chain Identifier (CCID) linked to a wallet
  /// @param account The wallet address
  /// @return The CCID, or bytes32(0) if the account has no registered identity on this chain
  function getIdentity(address account) external view returns (bytes32);
}
