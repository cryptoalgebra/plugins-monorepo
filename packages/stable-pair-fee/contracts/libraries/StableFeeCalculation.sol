// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import './FixedPointMathLib.sol';

/// @title StableFeeCalculation
/// @notice Math for the stable pair fee
library StableFeeCalculation {
  uint256 internal constant Q96 = 2 ** 96;

  /// @notice 1e6 = 100%
  uint256 internal constant ONE_E6 = 1e6;

  /// @notice 1e12 = 100%
  uint256 internal constant ONE_E12 = 1e12;

  /// @notice Sentinel for no decaying fee, used inside the optimal range
  uint256 internal constant UNDEFINED_DECAYING_FEE_E12 = 1e12 + 1;

  /// @notice Max fee toFeeE6 returns
  /// @dev Algebra reverts at fee >= 1e6. Community fee is taken out of the fee so it does not add on top
  uint256 internal constant MAX_FEE_E6 = 1e6 - 1;

  /// @notice Scale that keeps precision in sqrt ratio math
  uint256 internal constant Q48 = 2 ** 48;

  /// @notice Converts a 1e12 fee to 1e6 precision
  /// @dev Rounds up so a nonzero fee never becomes 0. Clamped to MAX_FEE_E6
  function toFeeE6(uint256 feeE12) internal pure returns (uint24) {
    uint256 feeE6 = (feeE12 + ONE_E6 - 1) / ONE_E6;
    return feeE6 > MAX_FEE_E6 ? uint24(MAX_FEE_E6) : uint24(feeE6);
  }

  /// @notice Price ratio of two sqrt prices, smaller over larger
  /// @return priceRatioX96 Ratio in Q96, always <= Q96
  function calculatePriceRatioX96(uint256 sqrtPrice1X96, uint256 sqrtPrice2X96) internal pure returns (uint256 priceRatioX96) {
    uint256 sqrtPriceRatioX48 = sqrtPrice1X96 < sqrtPrice2X96
      ? (sqrtPrice1X96 * Q48) / sqrtPrice2X96
      : (sqrtPrice2X96 * Q48) / sqrtPrice1X96;
    priceRatioX96 = sqrtPriceRatioX48 * sqrtPriceRatioX48;
  }

  /// @notice Fee that puts the pre-impact price at the close boundary of the optimal range
  /// @dev closeFee = 1 - priceRatio / (1 - optimalFee)
  /// @return closeBoundaryFeeE12 <= 0 inside the optimal range, > 0 outside
  function calculateCloseBoundaryFee(uint256 priceRatioX96, uint256 optimalFeeE6) internal pure returns (int256 closeBoundaryFeeE12) {
    closeBoundaryFeeE12 = int256(ONE_E12) - int256((ONE_E12 * priceRatioX96 * ONE_E6) / (ONE_E6 - optimalFeeE6) / Q96);
  }

  /// @notice Fee inside the optimal range
  /// @dev Sells get RP * (1 - optimalFee), buys pay RP / (1 - optimalFee)
  /// @dev Underflows if the price is outside the optimal range
  function calculateInsideOptimalRangeFee(
    uint256 priceRatioX96,
    uint256 optimalFeeE6,
    bool ammPriceBelowRP,
    bool zeroToOne
  ) internal pure returns (uint256 feeE12) {
    if (ammPriceBelowRP == zeroToOne) {
      // fee = 1 - (1 - optimalFee) * RP / ammPrice
      feeE12 = ONE_E12 - (ONE_E12 * (ONE_E6 - optimalFeeE6) * Q96) / priceRatioX96 / ONE_E6;
    } else {
      // fee = 1 - (1 - optimalFee) * ammPrice / RP
      feeE12 = ONE_E12 - (ONE_E12 * (ONE_E6 - optimalFeeE6) * priceRatioX96) / Q96 / ONE_E6;
    }
  }

  /// @notice Fee that puts the pre-impact price at the far boundary of the optimal range
  /// @dev farFee = 1 - (1 - optimalFee) * priceRatio
  function calculateFarBoundaryFee(uint256 priceRatioX96, uint256 optimalFeeE6) internal pure returns (uint256 farBoundaryFeeE12) {
    farBoundaryFeeE12 = ONE_E12 - (ONE_E12 * (ONE_E6 - optimalFeeE6) * priceRatioX96) / Q96 / ONE_E6;
  }

  /// @notice Raises the previous fee so the pre-impact price stays the same after the price moved away
  /// @dev adjustedFee = 1 - priceRatio * (1 - previousFee)
  function adjustPreviousFeeForPriceMovement(uint256 priceRatioX96, uint256 previousDecayingFeeE12) internal pure returns (uint256) {
    return ONE_E12 - (priceRatioX96 * (ONE_E12 - previousDecayingFeeE12)) / Q96;
  }

  /// @notice Decays the fee toward the target
  /// @param targetFeeE12 Fee to decay toward
  /// @param previousDecayingFeeE12 Fee to decay from, must be >= targetFeeE12
  /// @param k Decay factor per block in Q24, nonzero and < Q24
  /// @param blocksPassed Blocks since the last state write, <= type(uint40).max
  function calculateDecayingFee(
    uint256 targetFeeE12,
    uint256 previousDecayingFeeE12,
    uint256 k,
    uint256 blocksPassed
  ) internal pure returns (uint256 decayingFeeE12) {
    uint256 factorX24;
    if (blocksPassed <= 4) {
      factorX24 = fastPow(k, blocksPassed);
    } else {
      // exp(-logK * blocksPassed) in Q24
      factorX24 = (uint256(FixedPointMathLib.expWad(-int256((deriveLogK(k) << 24) * blocksPassed))) << 24) / 1e18;
    }

    decayingFeeE12 = targetFeeE12 + ((factorX24 * (previousDecayingFeeE12 - targetFeeE12)) >> 24);
  }

  /// @notice Log-space decay rate used when more than 4 blocks passed
  /// @dev logK = ceil(-lnWad(k) / 2^24). Rounding up keeps decay at least as fast as k^n
  /// @dev k < Q24 so -ln(k) > 0 and logK is never 0
  function deriveLogK(uint256 k) internal pure returns (uint256 logK) {
    uint256 kWad = (k * 1e18) >> 24;
    int256 lnK = FixedPointMathLib.lnWad(int256(kWad));
    logK = (uint256(-lnK) + ((uint256(1) << 24) - 1)) >> 24;
  }

  /// @notice k^blocksPassed in Q24
  /// @dev blocksPassed must be <= 4
  function fastPow(uint256 k, uint256 blocksPassed) internal pure returns (uint256 z) {
    assembly {
      switch blocksPassed
      case 1 {
        z := k
      }
      case 2 {
        z := shr(24, mul(k, k))
      }
      case 3 {
        let zz := mul(k, k)
        z := shr(48, mul(k, zz))
      }
      case 4 {
        let zz := mul(k, k)
        z := shr(72, mul(zz, zz))
      }
      case 0 {
        z := shl(24, 1)
      }
    }
  }
}
