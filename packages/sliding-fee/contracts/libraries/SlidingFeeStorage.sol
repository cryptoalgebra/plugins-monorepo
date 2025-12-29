// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for SlidingFee plugin (used by connector + implementation).
library SlidingFeeStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.slidingfee")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xaefd1f81f9eb25a0826f3b494fbd0af8927e22e79323f403015079084722c000;

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
