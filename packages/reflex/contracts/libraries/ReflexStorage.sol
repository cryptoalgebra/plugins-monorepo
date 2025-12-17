// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Shared namespaced storage for Reflex plugin (used by connector + implementation).
library ReflexStorage {
  /// @dev Storage namespace for Reflex plugin using ERC-7201-style namespacing.
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.reflex');

  struct Layout {
    address reflexRouter;
    bytes32 reflexConfigId;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
