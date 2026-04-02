// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for Access List plugin (used by connector + implementation).
library AccessListStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.accessList")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x5b0c9d54f9f3e0460ac1dd6f1c70376f10dd40c217c326b214099260fe536d00;

  struct Layout {
    address accessListRegistry;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
