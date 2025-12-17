// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for SlidingFee plugin (used by connector + implementation).
library SlidingFeeStorage {
  /// @dev Storage namespace for SlidingFee plugin using ERC-7201-style namespacing.
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.slidingfee');

  struct FeeFactors {
    uint128 zeroToOneFeeFactor;
    uint128 oneToZeroFeeFactor;
  }

  struct Layout {
    FeeFactors feeFactors;
    uint16 priceChangeFactor;
    uint16 baseFee;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
