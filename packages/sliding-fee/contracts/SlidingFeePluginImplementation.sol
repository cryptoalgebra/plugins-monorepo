// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import './libraries/SlidingFeeStorage.sol';
import './libraries/SlidingFeeMath.sol';
import './interfaces/ISlidingFeePluginImplementation.sol';

/// @title SlidingFee Plugin Implementation
/// @notice This contract contains ALL logic for SlidingFee plugin that works with namespaced storage
/// @dev Called via delegatecall from SlidingFeeConnector to reduce main contract size
contract SlidingFeePluginImplementation is ISlidingFeePluginImplementation {
  /// @notice Initialize SlidingFee plugin with base fee
  /// @param baseFee Base fee to set
  function initializeSlidingFee(uint16 baseFee) external {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    layout.feeFactors = SlidingFeeStorage.FeeFactors(
      uint128(1 << SlidingFeeMath.FEE_FACTOR_SHIFT),
      uint128(1 << SlidingFeeMath.FEE_FACTOR_SHIFT)
    );
    layout.priceChangeFactor = 1000;
    layout.baseFee = baseFee;
  }

  /// @notice Get fee and update factors
  /// @param zeroToOne Direction of swap
  /// @param currentTick Current pool tick
  /// @param lastTick Last tick
  /// @return fee The calculated fee
  function getFeeAndUpdateFactors(bool zeroToOne, int24 currentTick, int24 lastTick) external returns (uint16 fee) {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    SlidingFeeStorage.FeeFactors memory currentFeeFactors = layout.feeFactors;

    if (currentTick != lastTick) {
      currentFeeFactors = SlidingFeeMath.moveFeeFactors(currentFeeFactors, currentTick, lastTick, layout.priceChangeFactor);
      layout.feeFactors = currentFeeFactors;
    }

    return SlidingFeeMath.adjustedFee(layout.baseFee, currentFeeFactors, zeroToOne);
  }

  /// @notice Set price change factor
  /// @param newPriceChangeFactor New price change factor
  function setPriceChangeFactor(uint16 newPriceChangeFactor) external {
    SlidingFeeStorage.layout().priceChangeFactor = newPriceChangeFactor;
  }

  /// @notice Set base fee
  /// @param newBaseFee New base fee
  function setBaseFee(uint16 newBaseFee) external {
    SlidingFeeStorage.layout().baseFee = newBaseFee;
  }

  /// @notice Get price change factor
  /// @return Price change factor
  function getPriceChangeFactor() external view returns (uint16) {
    return SlidingFeeStorage.layout().priceChangeFactor;
  }

  /// @notice Get base fee
  /// @return Base fee
  function getBaseFee() external view returns (uint16) {
    return SlidingFeeStorage.layout().baseFee;
  }

  /// @notice Get fee factors
  /// @return zeroToOneFeeFactor Fee factor for zeroToOne direction
  /// @return oneToZeroFeeFactor Fee factor for oneToZero direction
  function getFeeFactors() external view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    SlidingFeeStorage.FeeFactors memory feeFactors = SlidingFeeStorage.layout().feeFactors;
    return (feeFactors.zeroToOneFeeFactor, feeFactors.oneToZeroFeeFactor);
  }
}
