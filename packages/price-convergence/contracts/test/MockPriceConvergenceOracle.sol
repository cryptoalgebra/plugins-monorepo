// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/IPriceConvergenceOracle.sol';

contract MockPriceConvergenceOracle is IPriceConvergenceOracle {
  int24 public twapTick;
  uint32 public storedLastTimepointTimestamp;
  bool public returnCurrentTimestamp;

  function setTwapTick(int24 tick) external {
    twapTick = tick;
  }

  function setLastTimepointTimestamp(uint32 timestamp) external {
    storedLastTimepointTimestamp = timestamp;
  }

  function setReturnCurrentTimestamp(bool value) external {
    returnCurrentTimestamp = value;
  }

  function getTimepoints(
    uint32[] memory secondsAgos
  ) external view override returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    uint256 length = secondsAgos.length;
    tickCumulatives = new int56[](length);
    volatilityCumulatives = new uint88[](length);

    for (uint256 i; i < length; ++i) {
      tickCumulatives[i] = -int56(twapTick) * int56(uint56(secondsAgos[i]));
    }
  }

  function lastTimepointTimestamp() external view override returns (uint32) {
    return returnCurrentTimestamp ? uint32(block.timestamp) : storedLastTimepointTimestamp;
  }
}
