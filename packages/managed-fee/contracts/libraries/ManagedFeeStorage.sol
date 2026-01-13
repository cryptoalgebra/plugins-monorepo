// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for ManagedFee plugin (used by connector + implementation).
library ManagedFeeStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.managedfee")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xad0a83737fd907b05da11f14264187ebacbfc28ef2f52f7956c1c0b9f3901700;

  struct Layout {
    mapping(address => bool) whitelistedAddresses;
    mapping(bytes32 => bool) usedNonces;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
