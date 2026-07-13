// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for KYC plugin (used by connector + implementation).
library KycStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.kyc")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x09db9c42558ca64801322a749e006e6eaeaff109a39f73862cf56ba9ca0e0900;

  struct Layout {
    address identityFactory;
    uint256 requiredTopic;
    bool paused;
    mapping(address issuer => bool trusted) trustedIssuers;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
