// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for Price Convergence plugin.
library PriceConvergenceStorage {
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.price-convergence');

  struct Layout {
    address vault;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
