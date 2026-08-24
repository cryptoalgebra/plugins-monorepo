// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../interfaces/IAlgebraVirtualPool.sol';

/// @title Records what the farming module forwards to an incentive
/// @dev The module only ever calls crossTo, so that is all this answers, and it keeps the arguments
/// so a test can assert the tick and the direction actually arrived.
contract MockVirtualPoolRecorder is IAlgebraVirtualPool {
  uint256 public crossToCount;
  int24 public lastTick;
  bool public lastZeroToOne;

  function crossTo(int24 nextTick, bool zeroToOne) external override returns (bool) {
    unchecked {
      crossToCount++;
    }
    lastTick = nextTick;
    lastZeroToOne = zeroToOne;
    return true;
  }
}
