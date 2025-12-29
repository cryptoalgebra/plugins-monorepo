// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './VolatilityOracle.sol';

/// @dev Shared namespaced storage for VolatilityOracle plugin (used by connector + implementation).
library VolatilityOracleStorage {
  uint256 internal constant UINT16_MODULO = 65536;
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.volatilityoracle")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant STORAGE_SLOT = 0x4cc5c36a434034246042af122c958f40937cad4aaa0154d3b81e721d7b524c00;

  struct Layout {
    uint16 timepointIndex;
    uint32 lastTimepointTimestamp;
    bool isInitialized;
    VolatilityOracle.Timepoint[UINT16_MODULO] timepoints;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = STORAGE_SLOT;
    assembly {
      l.slot := position
    }
  }
}
