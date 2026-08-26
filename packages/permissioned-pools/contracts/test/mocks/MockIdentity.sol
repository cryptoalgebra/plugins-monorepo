// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/onchainid/IIdentity.sol';

/// @title Mock OnchainID Identity
/// @notice Test mock storing ERC-735 claims
contract MockIdentity is IIdentity {
  struct Claim {
    uint256 topic;
    uint256 scheme;
    address issuer;
    bytes signature;
    bytes data;
    string uri;
  }

  mapping(bytes32 claimId => Claim claim) private claims;
  mapping(uint256 topic => bytes32[] claimIds) private claimIdsByTopic;

  /// @notice Add a claim. claimId = keccak256(abi.encode(issuer, topic)), same as OnchainID
  function addClaim(
    uint256 topic,
    uint256 scheme,
    address issuer,
    bytes calldata signature,
    bytes calldata data,
    string calldata uri
  ) external returns (bytes32 claimId) {
    claimId = keccak256(abi.encode(issuer, topic));
    if (claims[claimId].issuer == address(0)) {
      claimIdsByTopic[topic].push(claimId);
    }
    claims[claimId] = Claim(topic, scheme, issuer, signature, data, uri);
  }

  /// @inheritdoc IIdentity
  function getClaimIdsByTopic(uint256 _topic) external view override returns (bytes32[] memory) {
    return claimIdsByTopic[_topic];
  }

  /// @inheritdoc IIdentity
  function getClaim(
    bytes32 _claimId
  ) external view override returns (uint256 topic, uint256 scheme, address issuer, bytes memory signature, bytes memory data, string memory uri) {
    Claim storage claim = claims[_claimId];
    return (claim.topic, claim.scheme, claim.issuer, claim.signature, claim.data, claim.uri);
  }
}
