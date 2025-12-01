// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import { TickMath } from '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import { FullMath } from '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';

/// @title SlidingFee Plugin Implementation
/// @notice This contract contains ALL logic for SlidingFee plugin that works with namespaced storage
/// @dev Called via delegatecall from SlidingFeeConnector to reduce main contract size
contract SlidingFeePluginImplementation {
  /// @dev Storage namespace for SlidingFee plugin using ERC-7201
  bytes32 internal constant SLIDING_FEE_NAMESPACE = keccak256('algebra.storage.slidingfee');

  int16 internal constant FACTOR_DENOMINATOR = 1000;
  uint64 internal constant FEE_FACTOR_SHIFT = 96;

  struct FeeFactors {
    uint128 zeroToOneFeeFactor;
    uint128 oneToZeroFeeFactor;
  }

  struct SlidingFeeLayout {
    FeeFactors feeFactors;
    uint16 priceChangeFactor;
    uint16 baseFee;
  }

  /// @dev Fetch pointer of SlidingFee plugin's storage
  function _getSlidingFeeLayout() internal pure returns (SlidingFeeLayout storage layout) {
    bytes32 position = SLIDING_FEE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize SlidingFee plugin with base fee
  /// @dev Called via delegatecall from connector
  /// @param baseFee Base fee to set
  function initializeSlidingFee(uint16 baseFee) external {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    layout.feeFactors = FeeFactors(uint128(1 << FEE_FACTOR_SHIFT), uint128(1 << FEE_FACTOR_SHIFT));
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
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    FeeFactors memory currentFeeFactors;

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
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    layout.priceChangeFactor = newPriceChangeFactor;
  }

  /// @notice Set base fee
  /// @dev Called via delegatecall from connector
  /// @param newBaseFee New base fee
  function setBaseFee(uint16 newBaseFee) external {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    layout.baseFee = newBaseFee;
  }

  /// @notice Get price change factor
  /// @dev Called via staticcall from connector
  /// @return Price change factor
  function getPriceChangeFactor() external view returns (uint16) {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    return layout.priceChangeFactor;
  }

  /// @notice Get base fee
  /// @dev Called via staticcall from connector
  /// @return Base fee
  function getBaseFee() external view returns (uint16) {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    return layout.baseFee;
  }

  /// @notice Get fee factors
  /// @dev Called via staticcall from connector
  /// @return zeroToOneFeeFactor Fee factor for zeroToOne direction
  /// @return oneToZeroFeeFactor Fee factor for oneToZero direction
  function getFeeFactors() external view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
    FeeFactors memory feeFactors = layout.feeFactors;
    return (feeFactors.zeroToOneFeeFactor, feeFactors.oneToZeroFeeFactor);
  }

  function _calculateFeeFactors(
    SlidingFeeLayout storage layout,
    int24 currentTick,
    int24 lastTick,
    uint16 priceChangeFactor
  ) internal view returns (FeeFactors memory feeFactors) {
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
      feeFactors = FeeFactors(
        uint128(int128(newZeroToOneFeeFactor)),
        uint128(int128(feeFactors.oneToZeroFeeFactor) + int128(feeFactorImpact))
      );
    } else if (newZeroToOneFeeFactor <= 0) {
      feeFactors = FeeFactors(0, uint128(2 << FEE_FACTOR_SHIFT));
    } else {
      feeFactors = FeeFactors(uint128(2 << FEE_FACTOR_SHIFT), 0);
    }
  }
}
