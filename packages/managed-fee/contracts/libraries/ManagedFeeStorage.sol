// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for ManagedFee plugin (used by connector + implementation).
library ManagedFeeStorage {
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.managedfee');

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
