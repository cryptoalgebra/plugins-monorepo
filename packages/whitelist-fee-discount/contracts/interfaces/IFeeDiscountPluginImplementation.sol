// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IFeeDiscountPluginImplementation
/// @notice Interface for FeeDiscount plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in FeeDiscountConnector
interface IFeeDiscountPluginImplementation {
  function initializeFeeDiscount(address _feeDiscountRegistry) external;
  function setFeeDiscountRegistry(address _feeDiscountRegistry) external;
  function getFeeDiscountRegistry() external view returns (address);
  function applyFeeDiscount(address user, address pool, uint24 fee) external returns (uint24 updatedFee);
}
