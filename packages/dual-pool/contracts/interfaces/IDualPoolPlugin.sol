// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IDualPoolPlugin {
  error LiquidityNotAllowed();

  event DualPoolManagerSet(address dualPoolManager);

  function dualPoolManager() external view returns (address);
}
