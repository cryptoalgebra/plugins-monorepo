// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for FeeDiscount plugin (used by connector + implementation).
library FeeDiscountStorage {
  /// @dev Storage namespace for FeeDiscount plugin using ERC-7201-style namespacing.
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.feediscount');

  struct Layout {
    address feeDiscountRegistry;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
