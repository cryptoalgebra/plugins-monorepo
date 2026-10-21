// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../interfaces/IAlgebraVirtualPool.sol';

/// @title Records what the farming module forwards to an incentive
/// @dev Answers only crossTo, the one call the module makes
/// @dev Keeps its arguments so a test can check the tick and direction
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
