// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Shared namespaced storage for Reflex plugin (used by connector + implementation).
library ReflexStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.reflex")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xcd0f3acb777440854130dc9c5cab91523bf92801981202adc7a98c0d9ab0a200;

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
