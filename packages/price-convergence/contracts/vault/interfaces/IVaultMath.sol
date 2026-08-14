// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IVaultMath {
  error InvalidPosition();
  error ZeroAmounts();

  struct RangePosition {
    int24 lower;
    int24 upper;
    uint128 liquidity;
    uint256 used0;
    uint256 used1;
  }

  /// @notice Places the main position on the single tick containing the current price, then
  /// routes whichever token the main position could not use into a single-sided reserve
  /// position on the single tick immediately outside it.
  /// @dev reservePosition.liquidity is 0 when the main position used both tokens fully.
  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (RangePosition memory mainPosition, RangePosition memory reservePosition);
}
