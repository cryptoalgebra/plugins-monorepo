// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for Permissioned Pool plugin (used by connector + implementation).
library PermissionedPoolStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.permissionedPool")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xda4654b3c4d914d497f1227d2f841eeb5ed793466cacefeb030ade12ec392900;

  struct Layout {
    address allowlistCheckerRegistry;
    mapping(address => bool) allowedRouters;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
