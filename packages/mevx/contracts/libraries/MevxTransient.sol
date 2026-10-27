// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Carries the MEV protection fee of the current swap from one hook to the next
library MevxTransient {
  /// @dev keccak256('algebra.transient.mevx.feeRate'). The rate of an exactOut swap, charged once its input is known
  bytes32 internal constant FEE_RATE_SLOT = 0xeff98898298e400271a6d5f2d839af5f0ddf37f3c70553fae8c93fdd2c9421b8;
  /// @dev keccak256('algebra.transient.mevx.feeAmount'). The input taken by the pool for the plugin, distributed in afterSwap
  bytes32 internal constant FEE_AMOUNT_SLOT = 0xddd1e4fe54ebc08c66804ff61d4a00ef42b175aa3e56e91d7d8973c02285f546;

  function set(bytes32 slot, uint256 value) internal {
    assembly {
      tstore(slot, value)
    }
  }

  function get(bytes32 slot) internal view returns (uint256 value) {
    assembly {
      value := tload(slot)
    }
  }
}
