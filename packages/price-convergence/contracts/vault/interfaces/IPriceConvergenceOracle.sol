// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IPriceConvergenceOracle {
  function getTimepoints(
    uint32[] memory secondsAgos
  ) external view returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives);

  function lastTimepointTimestamp() external view returns (uint32);
}
