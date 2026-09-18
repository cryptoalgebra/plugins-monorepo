// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import './IStablePairFeePlugin.sol';

/// @title IStablePairFeePluginImplementation
/// @notice Interface for StablePairFee plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in StablePairFeeConnector
interface IStablePairFeePluginImplementation {
  function setFeeConfig(IStablePairFeePlugin.StableFeeConfig calldata feeConfig) external;

  function getFeeAndUpdateState(bool zeroToOne, uint160 sqrtPriceX96) external returns (uint24 feeE6);

  function quoteFees(
    IStablePairFeePlugin.StableFeeConfig calldata feeConfig,
    IStablePairFeePlugin.StableFeeState calldata feeState,
    uint160 sqrtPriceX96
  ) external view returns (uint24 feeZeroToOne, uint24 feeOneToZero);
}
