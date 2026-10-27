// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import './interfaces/IFeeDiscountPluginImplementation.sol';
import './libraries/FeeDiscountStorage.sol';
import './libraries/FeeDiscountMath.sol';

/// @title FeeDiscount Plugin Implementation
/// @notice This contract contains logic for FeeDiscount plugin that works with namespaced storage
/// @dev Called via delegatecall from FeeDiscountConnector to reduce main contract size
contract FeeDiscountPluginImplementation is IFeeDiscountPluginImplementation {
  /// @notice Initialize FeeDiscount plugin
  /// @param _feeDiscountRegistry Address of fee discount registry
  function initializeFeeDiscount(address _feeDiscountRegistry) external {
    FeeDiscountStorage.layout().feeDiscountRegistry = _feeDiscountRegistry;
  }

  /// @notice Set fee discount registry
  /// @param _feeDiscountRegistry New fee discount registry address
  function setFeeDiscountRegistry(address _feeDiscountRegistry) external {
    FeeDiscountStorage.layout().feeDiscountRegistry = _feeDiscountRegistry;
  }

  /// @notice Get fee discount registry
  /// @return Fee discount registry address
  function getFeeDiscountRegistry() external view returns (address) {
    return FeeDiscountStorage.layout().feeDiscountRegistry;
  }

  /// @notice Apply fee discount for user
  /// @param user User address
  /// @param pool Pool address
  /// @param fee Original fee
  /// @return updatedFee Fee after discount
  function applyFeeDiscount(address user, address pool, uint24 fee) external view returns (uint24 updatedFee) {
    return FeeDiscountMath.discountedFee(FeeDiscountStorage.layout().feeDiscountRegistry, user, pool, fee);
  }
}
