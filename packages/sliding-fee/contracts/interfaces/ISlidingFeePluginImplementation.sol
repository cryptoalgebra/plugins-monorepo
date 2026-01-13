// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

/// @title ISlidingFeePluginImplementation
/// @notice Interface for SlidingFee plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in SlidingFeeConnector
interface ISlidingFeePluginImplementation {
  function initializeSlidingFee(uint16 baseFee) external;
  function getFeeAndUpdateFactors(bool zeroToOne, int24 currentTick, int24 lastTick) external returns (uint16 fee);
  function setPriceChangeFactor(uint16 newPriceChangeFactor) external;
  function setBaseFee(uint16 newBaseFee) external;
  function getPriceChangeFactor() external view returns (uint16);
  function getBaseFee() external view returns (uint16);
  function getFeeFactors() external view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor);
}
