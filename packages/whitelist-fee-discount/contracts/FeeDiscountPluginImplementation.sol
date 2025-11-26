// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IFeeDiscountRegistry.sol';

/// @title FeeDiscount Plugin Implementation
/// @notice This contract contains ALL logic for FeeDiscount plugin that works with namespaced storage
/// @dev Called via delegatecall from FeeDiscountConnector to reduce main contract size
contract FeeDiscountPluginImplementation {
  /// @dev Storage namespace for FeeDiscount plugin using ERC-7201
  bytes32 internal constant FEE_DISCOUNT_NAMESPACE = keccak256('algebra.storage.feediscount');

  uint16 private constant FEE_DISCOUNT_DENOMINATOR = 1000;

  struct FeeDiscountLayout {
    address feeDiscountRegistry;
  }

  /// @dev Fetch pointer of FeeDiscount plugin's storage
  function _getFeeDiscountLayout() internal pure returns (FeeDiscountLayout storage layout) {
    bytes32 position = FEE_DISCOUNT_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize FeeDiscount plugin
  /// @dev Called via delegatecall from connector
  /// @param _feeDiscountRegistry Address of fee discount registry
  function initializeFeeDiscount(address _feeDiscountRegistry) external {
    FeeDiscountLayout storage layout = _getFeeDiscountLayout();
    layout.feeDiscountRegistry = _feeDiscountRegistry;
  }

  /// @notice Set fee discount registry
  /// @dev Called via delegatecall from connector
  /// @param _feeDiscountRegistry New fee discount registry address
  function setFeeDiscountRegistry(address _feeDiscountRegistry) external {
    FeeDiscountLayout storage layout = _getFeeDiscountLayout();
    layout.feeDiscountRegistry = _feeDiscountRegistry;
  }

  /// @notice Get fee discount registry
  /// @dev Called via staticcall from connector
  /// @return Fee discount registry address
  function getFeeDiscountRegistry() external view returns (address) {
    FeeDiscountLayout storage layout = _getFeeDiscountLayout();
    return layout.feeDiscountRegistry;
  }

  /// @notice Apply fee discount for user
  /// @dev Called via delegatecall from connector
  /// @param user User address
  /// @param pool Pool address
  /// @param fee Original fee
  /// @return updatedFee Fee after discount
  function applyFeeDiscount(address user, address pool, uint24 fee) external view returns (uint24 updatedFee) {
    FeeDiscountLayout storage layout = _getFeeDiscountLayout();
    uint24 feeDiscount = IFeeDiscountRegistry(layout.feeDiscountRegistry).feeDiscounts(user, pool);
    updatedFee = uint24((uint256(fee) * (FEE_DISCOUNT_DENOMINATOR - feeDiscount)) / FEE_DISCOUNT_DENOMINATOR);
  }
}
