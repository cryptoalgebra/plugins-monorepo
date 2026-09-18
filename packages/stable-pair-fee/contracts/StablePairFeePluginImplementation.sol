// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import './interfaces/IStablePairFeePlugin.sol';
import './interfaces/IStablePairFeePluginImplementation.sol';
import './libraries/StableFeeCalculation.sol';
import './libraries/StablePairFeeStorage.sol';

/// @title Stable Pair Fee Plugin Implementation
/// @notice Dynamic fee for pools of two assets expected to hold the same price
/// @dev Called via delegatecall from StablePairFeeConnector
/// @dev Assumes the pool fee is 0, since Algebra treats a zero override fee as no override
contract StablePairFeePluginImplementation is IStablePairFeePluginImplementation {
  /// @notice Max optimal fee, 1%
  uint256 public constant MAX_OPTIMAL_FEE_E6 = 1e4;

  /// @notice 100 subtracts the full close boundary fee
  uint256 public constant MAX_TARGET_MULTIPLIER = 100;

  /// @dev floor(sqrt((1e6 - MAX_OPTIMAL_FEE_E6) * 1e6))
  uint256 internal constant SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6 = 994_987;

  /// @dev Same as Algebra TickMath
  uint256 internal constant MIN_SQRT_RATIO = 4295128739;
  uint256 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

  function setFeeConfig(IStablePairFeePlugin.StableFeeConfig calldata feeConfig) external {
    if (feeConfig.k == 0) revert IStablePairFeePlugin.InvalidK(feeConfig.k);
    if (feeConfig.optimalFeeE6 > MAX_OPTIMAL_FEE_E6) revert IStablePairFeePlugin.InvalidOptimalFeeE6(feeConfig.optimalFeeE6);
    if (feeConfig.targetMultiplier > MAX_TARGET_MULTIPLIER) revert IStablePairFeePlugin.InvalidTargetMultiplier(feeConfig.targetMultiplier);
    _validateReferenceSqrtPriceX96(feeConfig.referenceSqrtPriceX96);

    StablePairFeeStorage.Layout storage layout = StablePairFeeStorage.layout();
    layout.feeConfig = feeConfig;
    // Zero price forces the next swap to read a fresh pool price
    layout.feeState = IStablePairFeePlugin.StableFeeState({
      decayingFeeE12: uint40(StableFeeCalculation.UNDEFINED_DECAYING_FEE_E12),
      sqrtAmmPriceX96: 0,
      blockNumber: uint40(block.number)
    });
  }

  function getFeeAndUpdateState(bool zeroToOne, uint160 sqrtPriceX96) external returns (uint24) {
    StablePairFeeStorage.Layout storage layout = StablePairFeeStorage.layout();
    IStablePairFeePlugin.StableFeeState memory feeState = layout.feeState;
    uint256 blockNumber = block.number;
    (uint256 lpFeeE12, uint256 decayingFeeE12, uint256 sqrtAmmPriceX96, bool isNewBlock) = _computeFee(
      layout.feeConfig,
      feeState,
      sqrtPriceX96,
      blockNumber,
      zeroToOne
    );

    // State is written once per block
    if (isNewBlock) {
      layout.feeState = IStablePairFeePlugin.StableFeeState({
        decayingFeeE12: uint40(decayingFeeE12),
        sqrtAmmPriceX96: uint160(sqrtAmmPriceX96),
        blockNumber: uint40(blockNumber)
      });
    }

    return StableFeeCalculation.toFeeE6(lpFeeE12);
  }

  function quoteFees(
    IStablePairFeePlugin.StableFeeConfig calldata feeConfig,
    IStablePairFeePlugin.StableFeeState calldata feeState,
    uint160 sqrtPriceX96
  ) external view returns (uint24 feeZeroToOne, uint24 feeOneToZero) {
    uint256 blockNumber = block.number;
    (uint256 feeZeroToOneE12, , , ) = _computeFee(feeConfig, feeState, sqrtPriceX96, blockNumber, true);
    (uint256 feeOneToZeroE12, , , ) = _computeFee(feeConfig, feeState, sqrtPriceX96, blockNumber, false);

    feeZeroToOne = StableFeeCalculation.toFeeE6(feeZeroToOneE12);
    feeOneToZero = StableFeeCalculation.toFeeE6(feeOneToZeroE12);
  }

  /// @param poolSqrtPriceX96 Current pool price, used only on the first swap of a block
  /// @return lpFeeE12 Fee for this swap
  /// @return decayingFeeE12 Decaying fee to store
  /// @return sqrtAmmPriceX96 Price the fee was computed from
  /// @return isNewBlock True if state must be written
  function _computeFee(
    IStablePairFeePlugin.StableFeeConfig memory feeConfig,
    IStablePairFeePlugin.StableFeeState memory feeState,
    uint160 poolSqrtPriceX96,
    uint256 blockNumber,
    bool zeroToOne
  ) private pure returns (uint256 lpFeeE12, uint256 decayingFeeE12, uint256 sqrtAmmPriceX96, bool isNewBlock) {
    if (feeConfig.referenceSqrtPriceX96 == 0) revert IStablePairFeePlugin.StableFeeNotConfigured();

    // Start of block price so splitting a swap gives no advantage
    // With zero liquidity the cached price can sit across the reference until the next block
    isNewBlock = blockNumber > feeState.blockNumber || feeState.sqrtAmmPriceX96 == 0;
    sqrtAmmPriceX96 = isNewBlock ? poolSqrtPriceX96 : feeState.sqrtAmmPriceX96;

    // 0 in the config update block. Also guards a non-monotonic block source
    uint256 blocksPassed = blockNumber > feeState.blockNumber ? blockNumber - feeState.blockNumber : 0;
    (lpFeeE12, decayingFeeE12) = _getFee(feeConfig, feeState, sqrtAmmPriceX96, isNewBlock, blocksPassed, zeroToOne);
  }

  /// @return lpFeeE12 Fee for this swap
  /// @return decayingFeeE12 Decaying fee to store. UNDEFINED_DECAYING_FEE_E12 inside the optimal range
  function _getFee(
    IStablePairFeePlugin.StableFeeConfig memory feeConfig,
    IStablePairFeePlugin.StableFeeState memory feeState,
    uint256 sqrtAmmPriceX96,
    bool isNewBlock,
    uint256 blocksPassed,
    bool zeroToOne
  ) private pure returns (uint256 lpFeeE12, uint256 decayingFeeE12) {
    uint256 sqrtReferencePriceX96 = feeConfig.referenceSqrtPriceX96;
    uint256 optimalFeeE6 = feeConfig.optimalFeeE6;

    uint256 priceRatioX96 = StableFeeCalculation.calculatePriceRatioX96(sqrtAmmPriceX96, sqrtReferencePriceX96);
    int256 closeBoundaryFeeE12 = StableFeeCalculation.calculateCloseBoundaryFee(priceRatioX96, optimalFeeE6);

    // Cached price, so crossing the reference within a block flips direction only next block
    bool ammPriceBelowRP = sqrtAmmPriceX96 < sqrtReferencePriceX96;

    if (closeBoundaryFeeE12 <= 0) {
      // Inside the optimal range
      lpFeeE12 = StableFeeCalculation.calculateInsideOptimalRangeFee(priceRatioX96, optimalFeeE6, ammPriceBelowRP, zeroToOne);
      decayingFeeE12 = StableFeeCalculation.UNDEFINED_DECAYING_FEE_E12;
    } else {
      // Outside the optimal range
      if (isNewBlock) {
        uint256 farBoundaryFeeE12 = StableFeeCalculation.calculateFarBoundaryFee(priceRatioX96, optimalFeeE6);
        decayingFeeE12 = _calculateDecayingFee(
          feeConfig,
          feeState,
          sqrtAmmPriceX96,
          uint256(closeBoundaryFeeE12),
          farBoundaryFeeE12,
          blocksPassed
        );
      } else {
        decayingFeeE12 = feeState.decayingFeeE12;
      }

      // Swaps moving the price further from the reference are free
      lpFeeE12 = ammPriceBelowRP == zeroToOne ? 0 : decayingFeeE12;
    }
  }

  function _calculateDecayingFee(
    IStablePairFeePlugin.StableFeeConfig memory feeConfig,
    IStablePairFeePlugin.StableFeeState memory feeState,
    uint256 sqrtAmmPriceX96,
    uint256 closeBoundaryFeeE12,
    uint256 farBoundaryFeeE12,
    uint256 blocksPassed
  ) private pure returns (uint256 decayingFeeE12) {
    bool ammPriceBelowRP = sqrtAmmPriceX96 < feeConfig.referenceSqrtPriceX96;
    uint256 previousSqrtAmmPriceX96 = feeState.sqrtAmmPriceX96;
    uint256 previousDecayingFeeE12 = feeState.decayingFeeE12;

    uint256 decayStartFeeE12;
    if (
      previousDecayingFeeE12 == StableFeeCalculation.UNDEFINED_DECAYING_FEE_E12 ||
      (previousSqrtAmmPriceX96 < feeConfig.referenceSqrtPriceX96) != ammPriceBelowRP
    ) {
      // Just left the optimal range or jumped across the reference
      decayStartFeeE12 = farBoundaryFeeE12;
    } else if (ammPriceBelowRP == (sqrtAmmPriceX96 < previousSqrtAmmPriceX96)) {
      // Moved further from the reference. Keep the same pre-impact price
      uint256 priceMovementRatioX96 = StableFeeCalculation.calculatePriceRatioX96(sqrtAmmPriceX96, previousSqrtAmmPriceX96);
      decayStartFeeE12 = StableFeeCalculation.adjustPreviousFeeForPriceMovement(priceMovementRatioX96, previousDecayingFeeE12);
    } else if (previousDecayingFeeE12 > farBoundaryFeeE12) {
      // Moved toward the reference. Cap at the new far boundary
      decayStartFeeE12 = farBoundaryFeeE12;
    } else {
      decayStartFeeE12 = previousDecayingFeeE12;
    }

    uint256 targetFeeE12 = farBoundaryFeeE12 - (closeBoundaryFeeE12 * feeConfig.targetMultiplier) / MAX_TARGET_MULTIPLIER;

    // A high multiplier makes the target rise toward the reference
    // The previous fee can then be below the target
    if (decayStartFeeE12 < targetFeeE12) {
      decayStartFeeE12 = targetFeeE12;
    }

    decayingFeeE12 = StableFeeCalculation.calculateDecayingFee(targetFeeE12, decayStartFeeE12, feeConfig.k, blocksPassed);
  }

  /// @dev Keeps the optimal range inside [MIN_SQRT_RATIO, MAX_SQRT_RATIO) for any allowed optimal fee
  function _validateReferenceSqrtPriceX96(uint256 referenceSqrtPriceX96) private pure {
    uint256 minReferenceSqrtPrice = (MIN_SQRT_RATIO * StableFeeCalculation.ONE_E6 + SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6 - 1) /
      SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6;
    uint256 maxReferenceSqrtPrice = (MAX_SQRT_RATIO * SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6) / StableFeeCalculation.ONE_E6;

    if (referenceSqrtPriceX96 < minReferenceSqrtPrice || referenceSqrtPriceX96 >= maxReferenceSqrtPrice) {
      revert IStablePairFeePlugin.InvalidReferenceSqrtPriceX96(referenceSqrtPriceX96);
    }
  }
}
