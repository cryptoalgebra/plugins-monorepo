// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;
pragma abicoder v1;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IAlgebraVirtualPool.sol';

/// @title Virtual pool mock that records the swap direction it was told about
/// @dev Separate from MockTimeVirtualPool on purpose. The gas suite attaches that one to a real pool,
/// so any extra storage written there moves the recorded gas numbers.
contract MockDirectionVirtualPool is IAlgebraVirtualPool {
  int24 public currentTick;
  bool public lastZeroToOne;
  uint256 public crossToCount;

  function crossTo(int24 nextTick, bool zeroToOne) external override returns (bool) {
    currentTick = nextTick;
    lastZeroToOne = zeroToOne;
    crossToCount++;

    return true;
  }
}
