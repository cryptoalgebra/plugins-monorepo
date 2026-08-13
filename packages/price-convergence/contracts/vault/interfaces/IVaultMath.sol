// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IVaultMath {
  error InvalidPositionWidth();
  error InvalidPosition();
  error OnlyVaultManager();
  error ZeroAddress();
  error ZeroAmounts();

  event PositionWidth(int24 positionWidth);

  struct RangePosition {
    int24 lower;
    int24 upper;
    uint128 liquidity;
    uint256 used0;
    uint256 used1;
  }

  function factory() external view returns (address);

  function positionWidth() external view returns (int24);

  /// @notice Places the main position on the single tick containing the current price, then
  /// routes whichever token the main position could not use into a single-sided reserve
  /// position immediately outside that tick.
  /// @dev reservePosition.liquidity is 0 when the main position used both tokens fully.
  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (RangePosition memory mainPosition, RangePosition memory reservePosition);
}
