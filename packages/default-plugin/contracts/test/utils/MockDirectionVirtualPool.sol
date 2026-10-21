// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;
pragma abicoder v1;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IAlgebraVirtualPool.sol';

/// @title Virtual pool mock that records the swap direction it was told about
/// @dev Not part of MockTimeVirtualPool, where extra storage writes would move gas snapshots
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
