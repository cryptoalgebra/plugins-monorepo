// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '../interfaces/IStablePairFeePlugin.sol';

/// @dev Shared namespaced storage for StablePairFee plugin (used by connector + implementation).
library StablePairFeeStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.stablepairfee")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x7697ca84c904df42174bc61c17e8f21645edfea868873b6d2a93edc9ca485200;

  struct Layout {
    IStablePairFeePlugin.StableFeeConfig feeConfig;
    IStablePairFeePlugin.StableFeeState feeState;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
