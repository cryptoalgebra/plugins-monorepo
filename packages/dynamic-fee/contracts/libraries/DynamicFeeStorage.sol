// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { AlgebraFeeConfigurationU144 } from '../types/AlgebraFeeConfigurationU144.sol';

/// @dev Shared namespaced storage for DynamicFee plugin (used by connector + implementation).
library DynamicFeeStorage {
  /// @dev Storage namespace for DynamicFee plugin using ERC-7201-style namespacing.
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.dynamicfee');

  struct Layout {
    AlgebraFeeConfigurationU144 feeConfig;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
