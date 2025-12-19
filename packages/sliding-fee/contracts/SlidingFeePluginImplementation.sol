// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { TickMath } from '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import { FullMath } from '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import './libraries/SlidingFeeStorage.sol';
import './interfaces/ISlidingFeePluginImplementation.sol';

/// @title SlidingFee Plugin Implementation
/// @notice This contract contains ALL logic for SlidingFee plugin that works with namespaced storage
/// @dev Called via delegatecall from SlidingFeeConnector to reduce main contract size
contract SlidingFeePluginImplementation is ISlidingFeePluginImplementation {
  int16 internal constant FACTOR_DENOMINATOR = 1000;
  uint64 internal constant FEE_FACTOR_SHIFT = 96;

  /// @notice Initialize SlidingFee plugin with base fee
  /// @dev Called via delegatecall from connector
  /// @param baseFee Base fee to set
  function initializeSlidingFee(uint16 baseFee) external {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    layout.feeFactors = SlidingFeeStorage.FeeFactors(uint128(1 << FEE_FACTOR_SHIFT), uint128(1 << FEE_FACTOR_SHIFT));
    layout.priceChangeFactor = 1000;
    layout.baseFee = baseFee;
  }

  /// @notice Get fee and update factors
  /// @dev Called via delegatecall from connector
  /// @param zeroToOne Direction of swap
  /// @param currentTick Current pool tick
  /// @param lastTick Last tick
  /// @return fee The calculated fee
  function getFeeAndUpdateFactors(bool zeroToOne, int24 currentTick, int24 lastTick) external returns (uint16 fee) {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    SlidingFeeStorage.FeeFactors memory currentFeeFactors;

    uint16 priceChangeFactor = layout.priceChangeFactor;
    uint16 baseFee = layout.baseFee;

    if (currentTick != lastTick) {
      currentFeeFactors = _calculateFeeFactors(layout, currentTick, lastTick, priceChangeFactor);
      layout.feeFactors = currentFeeFactors;
    } else {
      currentFeeFactors = layout.feeFactors;
    }

    uint256 adjustedFee = zeroToOne
      ? (uint256(baseFee) * currentFeeFactors.zeroToOneFeeFactor) >> FEE_FACTOR_SHIFT
      : (uint256(baseFee) * currentFeeFactors.oneToZeroFeeFactor) >> FEE_FACTOR_SHIFT;

    if (adjustedFee > type(uint16).max) {
      adjustedFee = type(uint16).max;
    } else if (adjustedFee == 0) {
      adjustedFee = 1;
    }
    return uint16(adjustedFee);
  }

  /// @notice Set price change factor
  /// @dev Called via delegatecall from connector
  /// @param newPriceChangeFactor New price change factor
  function setPriceChangeFactor(uint16 newPriceChangeFactor) external {
    SlidingFeeStorage.layout().priceChangeFactor = newPriceChangeFactor;
  }

  /// @notice Set base fee
  /// @dev Called via delegatecall from connector
  /// @param newBaseFee New base fee
  function setBaseFee(uint16 newBaseFee) external {
    SlidingFeeStorage.layout().baseFee = newBaseFee;
  }

  /// @notice Get price change factor
  /// @dev Called via staticcall from connector
  /// @return Price change factor
  function getPriceChangeFactor() external view returns (uint16) {
    return SlidingFeeStorage.layout().priceChangeFactor;
  }

  /// @notice Get base fee
  /// @dev Called via staticcall from connector
  /// @return Base fee
  function getBaseFee() external view returns (uint16) {
    return SlidingFeeStorage.layout().baseFee;
  }

  /// @notice Get fee factors
  /// @dev Called via staticcall from connector
  /// @return zeroToOneFeeFactor Fee factor for zeroToOne direction
  /// @return oneToZeroFeeFactor Fee factor for oneToZero direction
  function getFeeFactors() external view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    SlidingFeeStorage.FeeFactors memory feeFactors = SlidingFeeStorage.layout().feeFactors;
    return (feeFactors.zeroToOneFeeFactor, feeFactors.oneToZeroFeeFactor);
  }

  function _calculateFeeFactors(
    SlidingFeeStorage.Layout storage layout,
    int24 currentTick,
    int24 lastTick,
    uint16 priceChangeFactor
  ) internal view returns (SlidingFeeStorage.FeeFactors memory feeFactors) {
    int256 tickDelta = int256(currentTick) - int256(lastTick);
    if (tickDelta > TickMath.MAX_TICK) {
      tickDelta = TickMath.MAX_TICK;
    } else if (tickDelta < TickMath.MIN_TICK) {
      tickDelta = TickMath.MIN_TICK;
    }
    uint256 sqrtPriceDelta = uint256(TickMath.getSqrtRatioAtTick(int24(tickDelta)));

    // price change is positive after oneToZero prevalence
    int256 priceChangeRatio = int256(FullMath.mulDiv(sqrtPriceDelta, sqrtPriceDelta, 2 ** 96)) -
      int256(1 << FEE_FACTOR_SHIFT);
    int256 feeFactorImpact = (priceChangeRatio * int256(uint256(priceChangeFactor))) / FACTOR_DENOMINATOR;

    feeFactors = layout.feeFactors;

    int256 newZeroToOneFeeFactor = int128(feeFactors.zeroToOneFeeFactor) - feeFactorImpact;

    if (0 < newZeroToOneFeeFactor && newZeroToOneFeeFactor < (int128(2) << FEE_FACTOR_SHIFT)) {
      feeFactors = SlidingFeeStorage.FeeFactors(
        uint128(int128(newZeroToOneFeeFactor)),
        uint128(int128(feeFactors.oneToZeroFeeFactor) + int128(feeFactorImpact))
      );
    } else if (newZeroToOneFeeFactor <= 0) {
      feeFactors = SlidingFeeStorage.FeeFactors(0, uint128(2 << FEE_FACTOR_SHIFT));
    } else {
      feeFactors = SlidingFeeStorage.FeeFactors(uint128(2 << FEE_FACTOR_SHIFT), 0);
    }
  }
}
