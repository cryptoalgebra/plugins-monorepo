// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

import '../interfaces/IRebalanceManager.sol';

/// @title Records what the ALM module forwards to a rebalance manager
/// @dev The real manager may decline to act, so it cannot show that the call arrived
contract MockRebalanceManagerRecorder is IRebalanceManager {
  uint256 public calls;
  int24 public lastCurrentTick;
  int24 public lastSlowTwapTick;
  int24 public lastFastTwapTick;
  uint32 public lastBlockTimestamp;

  function obtainTWAPAndRebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 blockTimestamp) external override {
    unchecked {
      calls++;
    }
    lastCurrentTick = currentTick;
    lastSlowTwapTick = slowTwapTick;
    lastFastTwapTick = fastTwapTick;
    lastBlockTimestamp = blockTimestamp;
  }
}
