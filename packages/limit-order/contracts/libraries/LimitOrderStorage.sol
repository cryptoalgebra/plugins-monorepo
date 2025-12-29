// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for LimitOrder plugin (used by connector + implementation).
library LimitOrderStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.limitorder")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xf48a92d70adb2fd6c583ec595b4e4d7cf541958365597357ba32f5bc164b6300;

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
