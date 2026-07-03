// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TokenDeltaMath.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';

contract VaultMathTestHelper {
  function getSqrtRatioAtTick(int24 tick) external pure returns (uint160) {
    return TickMath.getSqrtRatioAtTick(tick);
  }

  function getLiquidityForAmounts(
    uint160 sqrtPriceX96,
    int24 lower,
    int24 upper,
    uint256 amount0,
    uint256 amount1
  ) external pure returns (uint128) {
    return
      LiquidityAmounts.getLiquidityForAmounts(
        sqrtPriceX96,
        TickMath.getSqrtRatioAtTick(lower),
        TickMath.getSqrtRatioAtTick(upper),
        amount0,
        amount1
      );
  }

  /// @dev Amounts owed by pool.mint for a full-range position. Rounds up, matching Algebra core.
  function getFullRangeMintAmounts(uint160 sqrtPriceX96, uint128 liquidity) external pure returns (uint256 amount0, uint256 amount1) {
    uint160 sqrtMinX96 = TickMath.getSqrtRatioAtTick(TickMath.MIN_TICK);
    uint160 sqrtMaxX96 = TickMath.getSqrtRatioAtTick(TickMath.MAX_TICK);
    amount0 = TokenDeltaMath.getToken0Delta(sqrtPriceX96, sqrtMaxX96, liquidity, true);
    amount1 = TokenDeltaMath.getToken1Delta(sqrtMinX96, sqrtPriceX96, liquidity, true);
  }
}
