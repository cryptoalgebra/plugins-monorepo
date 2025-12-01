// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/IFeeDiscountRegistry.sol';

/// @title Mock Fee Discount Registry for testing
/// @notice Simplified mock for unit tests
contract MockFeeDiscountRegistry is IFeeDiscountRegistry {
  mapping(address => mapping(address => uint16)) private _feeDiscounts;

  function feeDiscounts(address user, address pool) external view override returns (uint16 feeDiscount) {
    return _feeDiscounts[user][pool];
  }

  function setFeeDiscount(address user, address[] memory pools, uint16[] memory newDiscounts) external override {
    for (uint256 i = 0; i < pools.length; i++) {
      _feeDiscounts[user][pools[i]] = newDiscounts[i];
    }
  }

  function setFeeDiscountSimple(address user, address pool, uint16 discount) external {
    _feeDiscounts[user][pool] = discount;
  }

  function algebraFactory() external pure override returns (address) {
    return address(0);
  }

  function FEE_DISCOUNT_MANAGER() external pure override returns (bytes32) {
    return keccak256('FEE_DISCOUNT_MANAGER');
  }

  function FEE_DISCOUNT_DENOMINATOR() external pure override returns (uint16) {
    return 1000;
  }
}
