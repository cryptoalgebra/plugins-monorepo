// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';

library DualPoolStorage {
  // keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.dualpool")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant DUAL_POOL_NAMESPACE = 0xee8751115cf3af5d050ac8401cbbd2b39829fb33c37bcb6239b5860c2d613300;

  struct Layout {
    IERC4626 vault0;
    IERC4626 vault1;
    bool initialized;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = DUAL_POOL_NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
