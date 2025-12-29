// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for FeeDiscount plugin (used by connector + implementation).
library FeeDiscountStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.feediscount")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xb52f6c388bc01f052495924fd2facf0f81baeac5975b25912d0279719977d300;

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
