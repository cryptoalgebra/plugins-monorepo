// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '../interfaces/IFeeDiscountRegistry.sol';

/// @title FeeDiscount math
/// @dev Shared by the implementation, which applies the discount in a swap, and the connector, which quotes it
library FeeDiscountMath {
  uint16 internal constant FEE_DISCOUNT_DENOMINATOR = 1000;

  /// @notice The fee after the discount the registry holds for the user in the pool
  /// @dev A full discount gives a zero fee, which 1.3 applies as a free swap
  function discountedFee(address registry, address user, address pool, uint24 fee) internal view returns (uint24) {
    uint16 feeDiscount = IFeeDiscountRegistry(registry).feeDiscounts(user, pool);
    return uint24((uint256(fee) * (FEE_DISCOUNT_DENOMINATOR - feeDiscount)) / FEE_DISCOUNT_DENOMINATOR);
  }
}
