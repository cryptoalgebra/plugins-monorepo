// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title IIdentity
/// @notice Minimal subset of the OnchainID Identity (ERC-735) interface (https://github.com/onchain-id/solidity)
/// @dev Only the functions used by the KYC plugin are declared here to avoid pragma conflicts
/// with the upstream onchain-id solidity package
interface IIdentity {
  /// @notice Get all claim IDs stored on the identity for a given topic
  /// @param _topic The claim topic
  /// @return claimIds Array of claim IDs (claimId = keccak256(abi.encode(issuer, topic)))
  function getClaimIdsByTopic(uint256 _topic) external view returns (bytes32[] memory claimIds);

  /// @notice Get a claim by its ID
  /// @param _claimId The claim ID
  /// @return topic The claim topic
  /// @return scheme The signature scheme
  /// @return issuer The claim issuer address
  /// @return signature The issuer's signature over the claim
  /// @return data The claim data
  /// @return uri The claim URI
  function getClaim(
    bytes32 _claimId
  ) external view returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri);
}
