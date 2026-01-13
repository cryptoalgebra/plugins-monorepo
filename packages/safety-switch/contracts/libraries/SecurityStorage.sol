// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for Security plugin (used by connector + implementation).
library SecurityStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.security")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x9487542cdccfb581bd8b0a4955905336ba6ab384679a5f7877ee877650445f00;

  struct Layout {
    address securityRegistry;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
