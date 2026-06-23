// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IVaultMath {
  function factory() external view returns (address);

  function positionWidth() external view returns (int24);

  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (int24 lower, int24 upper, uint128 liquidity, uint256 used0, uint256 used1);
}
