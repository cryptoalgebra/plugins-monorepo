// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

/// @title IStablePairFeePlugin
/// @notice Dynamic fee for pools of two assets expected to hold the same price
interface IStablePairFeePlugin {
  /// @notice Fee config of the pool
  /// @param k Decay factor per block in Q24. Smaller k decays faster
  /// @param optimalFeeE6 Width of the optimal range in price space, 1e6 precision
  /// @param targetMultiplier Share of the close boundary fee subtracted from the far boundary fee, 0-100
  /// @param referenceSqrtPriceX96 Center of the optimal range as sqrt Q96 price
  struct StableFeeConfig {
    uint24 k;
    uint24 optimalFeeE6;
    uint8 targetMultiplier;
    uint160 referenceSqrtPriceX96;
  }

  /// @notice Fee state, written on the first swap of each block
  /// @param decayingFeeE12 Decaying fee in 1e12 precision. UNDEFINED_DECAYING_FEE_E12 inside the optimal range
  /// @param sqrtAmmPriceX96 Pool price at the start of the last swapped block. 0 after a config update
  /// @param blockNumber Block of the last state write
  struct StableFeeState {
    uint40 decayingFeeE12;
    uint160 sqrtAmmPriceX96;
    uint40 blockNumber;
  }

  error StableFeeNotConfigured();
  error InvalidK(uint256 k);
  error InvalidOptimalFeeE6(uint256 optimalFeeE6);
  error InvalidTargetMultiplier(uint256 targetMultiplier);
  error InvalidReferenceSqrtPriceX96(uint256 referenceSqrtPriceX96);

  event StableFeeConfigUpdated(StableFeeConfig feeConfig);

  /// @notice Current fee config
  function stableFeeConfig() external view returns (uint24 k, uint24 optimalFeeE6, uint8 targetMultiplier, uint160 referenceSqrtPriceX96);

  /// @notice Current fee state
  function stableFeeState() external view returns (uint40 decayingFeeE12, uint160 sqrtAmmPriceX96, uint40 blockNumber);

  /// @notice Fees the next swap in each direction would pay, in 1e6 precision
  /// @dev Reverts if the config is not set
  function getStableFees() external view returns (uint24 feeZeroToOne, uint24 feeOneToZero);

  /// @notice Sets the fee config and resets the fee state
  function setStableFeeConfig(StableFeeConfig calldata feeConfig) external;
}
