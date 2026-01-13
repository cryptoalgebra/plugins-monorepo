// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for ALM plugin (used by connector + implementation).
library AlmStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.alm")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant ALM_NAMESPACE = 0x45cac7a29736c3b5f9d22ba10a55f4f53e0718585c05d584962ae10a219bbf00;

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
