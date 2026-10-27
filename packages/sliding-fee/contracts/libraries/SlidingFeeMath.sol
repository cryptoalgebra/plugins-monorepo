// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import { TickMath } from '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import { FullMath } from '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import './SlidingFeeStorage.sol';

/// @title SlidingFee math
/// @dev Shared by the implementation, which applies the fee in a swap, and the connector, which quotes it
library SlidingFeeMath {
  int16 internal constant FACTOR_DENOMINATOR = 1000;
  uint64 internal constant FEE_FACTOR_SHIFT = 96;

  /// @notice The fee factors after the price moved from lastTick to currentTick
  function moveFeeFactors(
    SlidingFeeStorage.FeeFactors memory feeFactors,
    int24 currentTick,
    int24 lastTick,
    uint16 priceChangeFactor
  ) internal pure returns (SlidingFeeStorage.FeeFactors memory) {
    int256 tickDelta = int256(currentTick) - int256(lastTick);
    if (tickDelta > TickMath.MAX_TICK) {
      tickDelta = TickMath.MAX_TICK;
    } else if (tickDelta < TickMath.MIN_TICK) {
      tickDelta = TickMath.MIN_TICK;
    }
    uint256 sqrtPriceDelta = uint256(TickMath.getSqrtRatioAtTick(int24(tickDelta)));
    // price change is positive after oneToZero prevalence
    int256 priceChangeRatio = int256(FullMath.mulDiv(sqrtPriceDelta, sqrtPriceDelta, 2 ** 96)) - int256(1 << FEE_FACTOR_SHIFT);
    int256 feeFactorImpact = (priceChangeRatio * int256(uint256(priceChangeFactor))) / FACTOR_DENOMINATOR;

    int256 newZeroToOneFeeFactor = int128(feeFactors.zeroToOneFeeFactor) - feeFactorImpact;
    if (0 < newZeroToOneFeeFactor && newZeroToOneFeeFactor < (int128(2) << FEE_FACTOR_SHIFT)) {
      return
        SlidingFeeStorage.FeeFactors(
          uint128(int128(newZeroToOneFeeFactor)),
          uint128(int128(feeFactors.oneToZeroFeeFactor) + int128(feeFactorImpact))
        );
    } else if (newZeroToOneFeeFactor <= 0) {
      return SlidingFeeStorage.FeeFactors(0, uint128(2 << FEE_FACTOR_SHIFT));
    } else {
      return SlidingFeeStorage.FeeFactors(uint128(2 << FEE_FACTOR_SHIFT), 0);
    }
  }

  /// @notice The base fee scaled by the factor of the swap direction, never zero
  function adjustedFee(uint16 baseFee, SlidingFeeStorage.FeeFactors memory feeFactors, bool zeroToOne) internal pure returns (uint16) {
    uint256 fee =
      zeroToOne
        ? (uint256(baseFee) * feeFactors.zeroToOneFeeFactor) >> FEE_FACTOR_SHIFT
        : (uint256(baseFee) * feeFactors.oneToZeroFeeFactor) >> FEE_FACTOR_SHIFT;

    if (fee > type(uint16).max) {
      fee = type(uint16).max;
    } else if (fee == 0) {
      // a zero fee from a dynamic fee plugin is applied as is in 1.3
      fee = 1;
    }
    return uint16(fee);
  }
}
