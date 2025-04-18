// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IFeeDiscountRegistry {
  event FeeDiscount(address user, address pool, uint16 newDiscount);

  function feeDiscounts(address user, address pool) external returns (uint16 feeDiscount);
  function setFeeDiscount(address user, address[] memory pools, uint16[] memory newDiscounts) external;

  function algebraFactory() external view returns (address);
  function FEE_DISCOUNT_MANAGER() external pure returns (bytes32);
  function FEE_DISCOUNT_DENOMINATOR() external pure returns (uint16);
}
