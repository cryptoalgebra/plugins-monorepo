// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../interfaces/IRebalanceManager.sol';

/// @title Records what the ALM module forwards to a rebalance manager
/// @dev The real RebalanceManager needs a vault and a pool and then decides whether to act at all,
/// which makes it useless for asserting that the call arrived. This only records.
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
