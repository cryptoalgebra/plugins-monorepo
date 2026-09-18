// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '../libraries/StableFeeCalculation.sol';

/// @dev Exposes StableFeeCalculation for tests
contract StableFeeCalculationTest {
  function toFeeE6(uint256 feeE12) external pure returns (uint24) {
    return StableFeeCalculation.toFeeE6(feeE12);
  }

  function calculatePriceRatioX96(uint256 sqrtPrice1X96, uint256 sqrtPrice2X96) external pure returns (uint256) {
    return StableFeeCalculation.calculatePriceRatioX96(sqrtPrice1X96, sqrtPrice2X96);
  }

  function calculateCloseBoundaryFee(uint256 priceRatioX96, uint256 optimalFeeE6) external pure returns (int256) {
    return StableFeeCalculation.calculateCloseBoundaryFee(priceRatioX96, optimalFeeE6);
  }

  function calculateFarBoundaryFee(uint256 priceRatioX96, uint256 optimalFeeE6) external pure returns (uint256) {
    return StableFeeCalculation.calculateFarBoundaryFee(priceRatioX96, optimalFeeE6);
  }

  function calculateInsideOptimalRangeFee(
    uint256 priceRatioX96,
    uint256 optimalFeeE6,
    bool ammPriceBelowRP,
    bool zeroToOne
  ) external pure returns (uint256) {
    return StableFeeCalculation.calculateInsideOptimalRangeFee(priceRatioX96, optimalFeeE6, ammPriceBelowRP, zeroToOne);
  }

  function calculateDecayingFee(
    uint256 targetFeeE12,
    uint256 previousFeeE12,
    uint256 k,
    uint256 blocksPassed
  ) external pure returns (uint256) {
    return StableFeeCalculation.calculateDecayingFee(targetFeeE12, previousFeeE12, k, blocksPassed);
  }

  function deriveLogK(uint256 k) external pure returns (uint256) {
    return StableFeeCalculation.deriveLogK(k);
  }
}
