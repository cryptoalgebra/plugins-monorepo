// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Shared namespaced storage for fee auction plugin (used by connector + implementation).
library FeeAuctionStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.feeauction")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xa57468327fdde356062f12a9b7b1ed7e38c56e270ec1764fc1c4c7d0427aa300;

  struct Layout {
    uint24 baseFee;
    uint24 mevTaxMultiplier;
    uint24 maxMevTax;
    bool mevTaxEnabled;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
