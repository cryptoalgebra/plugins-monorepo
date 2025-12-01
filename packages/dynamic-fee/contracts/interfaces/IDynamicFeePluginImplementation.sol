// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../types/AlgebraFeeConfiguration.sol';

/// @title IDynamicFeePluginImplementation
/// @notice Interface for DynamicFee plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in DynamicFeeConnector
interface IDynamicFeePluginImplementation {
  function initializeDynamicFee(AlgebraFeeConfiguration memory config) external;
  function getCurrentFee(uint88 volatilityAverage) external view returns (uint16 fee);
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external;
  function getFeeConfig()
    external
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee);
}
