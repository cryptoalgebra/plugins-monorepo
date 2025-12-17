// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './VolatilityOracle.sol';

/// @dev Shared namespaced storage for VolatilityOracle plugin (used by connector + implementation).
library VolatilityOracleStorage {
  uint256 internal constant UINT16_MODULO = 65536;

  /// @dev Storage namespace for VolatilityOracle plugin using ERC-7201-style namespacing.
  bytes32 internal constant STORAGE_SLOT = keccak256('algebra.storage.volatilityoracle');

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
