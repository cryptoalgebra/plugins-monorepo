// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Shared namespaced storage for Mevx plugin (used by connector + implementation).
library MevxStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.mevx")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x0265d00335a0dde512278a67fe4cbfe91190506046edc3e7f5f678ec695c6500;

  struct Layout {
    address mevxRouter;
    address mevxExecutor;
    address mevxProfitDistributor;
    bytes32 mevxConfigId;
    uint256 minGasLeft;
    uint256 callGasBudget;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
