// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for LimitOrder plugin (used by connector + implementation).
library LimitOrderStorage {
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.limitorder');

  struct Layout {
    address limitOrderManager;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
