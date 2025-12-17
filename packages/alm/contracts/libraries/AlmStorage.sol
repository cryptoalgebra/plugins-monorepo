// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for ALM plugin (used by connector + implementation).
/// Keeping this in one place avoids accidental slot/struct drift.
library AlmStorage {
  /// @dev Storage namespace for ALM plugin using ERC-7201-style namespacing.
  bytes32 internal constant ALM_NAMESPACE = keccak256('algebra.storage.alm');

  struct Layout {
    address rebalanceManager;
    uint32 slowTwapPeriod;
    uint32 fastTwapPeriod;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = ALM_NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
