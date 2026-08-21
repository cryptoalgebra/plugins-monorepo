// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../vault/interfaces/IPriceConvergenceOracle.sol';

contract MockPriceConvergenceOracle is IPriceConvergenceOracle {
  int24 public twapTick;
  uint32 public storedLastTimepointTimestamp;
  bool public returnCurrentTimestamp;
  int56 public cumulativeSkew;

  mapping(uint32 => int24) private periodTicks;
  mapping(uint32 => bool) private periodTickSet;

  function setTwapTick(int24 tick) external {
    twapTick = tick;
  }

  /// @notice Answers this one period with its own tick, leaving every other period on twapTick.
  /// @dev The main and aux TWAP windows must be able to disagree, the way real ones do.
  function setTwapTickForPeriod(uint32 period, int24 tick) external {
    periodTicks[period] = tick;
    periodTickSet[period] = true;
  }

  /// @notice Offsets the oldest cumulative so the tick delta stops dividing evenly by the period.
  function setCumulativeSkew(int56 skew) external {
    cumulativeSkew = skew;
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
      uint32 period = secondsAgos[i];
      int24 tick = periodTickSet[period] ? periodTicks[period] : twapTick;
      tickCumulatives[i] = -int56(tick) * int56(uint56(period));
      if (period != 0) tickCumulatives[i] += cumulativeSkew;
    }
  }

  function lastTimepointTimestamp() external view override returns (uint32) {
    return returnCurrentTimestamp ? uint32(block.timestamp) : storedLastTimepointTimestamp;
  }
}
