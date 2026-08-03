// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './IIdentity.sol';

/// @title IClaimIssuer
/// @notice Minimal subset of the OnchainID ClaimIssuer interface (https://github.com/onchain-id/solidity)
/// @dev Only the functions used by the Onchain ID allowlist checker are declared here to avoid
/// pragma conflicts with the upstream onchain-id solidity package
interface IClaimIssuer {
  /// @notice Check if a claim is valid (signature correct and not revoked)
  /// @param _identity The identity contract holding the claim
  /// @param claimTopic The claim topic
  /// @param sig The issuer's signature over the claim
  /// @param data The claim data
  /// @return True if the claim is valid
  function isClaimValid(IIdentity _identity, uint256 claimTopic, bytes calldata sig, bytes calldata data) external view returns (bool);
}
