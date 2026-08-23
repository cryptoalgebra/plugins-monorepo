// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/alm-plugin/contracts/interfaces/IRebalanceManager.sol';

/// @title Mock rebalance manager for ALM tests
/// @notice Records what the ALM module forwards. RebalanceManager itself needs a vault and positions
contract MockRebalanceManager is IRebalanceManager {
  uint256 public rebalanceCount;
  int24 public lastCurrentTick;
  int24 public lastSlowTwapTick;
  int24 public lastFastTwapTick;
  uint32 public lastTimestamp;

  function obtainTWAPAndRebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 blockTimestamp) external override {
    unchecked {
      rebalanceCount++;
    }
    lastCurrentTick = currentTick;
    lastSlowTwapTick = slowTwapTick;
    lastFastTwapTick = fastTwapTick;
    lastTimestamp = blockTimestamp;
  }
}
