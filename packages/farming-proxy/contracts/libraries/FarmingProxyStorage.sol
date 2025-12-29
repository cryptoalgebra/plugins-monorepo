// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for FarmingProxy plugin (used by connector + implementation).
library FarmingProxyStorage {

  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.farmingproxy")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0xdefe014d06c76a87f6a6efbd410e650d6bcbb85e816546b55f626b436c8a1000;

  struct Layout {
    address incentive;
    address lastIncentiveOwner;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
