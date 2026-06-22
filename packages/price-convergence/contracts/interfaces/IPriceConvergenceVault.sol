// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IPriceConvergenceVault {
  function rebalance(uint160 limitSqrtPrice, int24 positionWidth) external;

  function pool() external view returns (address);

  function token0() external view returns (address);

  function token1() external view returns (address);
}
