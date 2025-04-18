// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IFeeDiscountRegistry.sol';

contract FeeDiscountRegistry is IFeeDiscountRegistry {
  address public immutable override algebraFactory;
  bytes32 public constant override FEE_DISCOUNT_MANAGER = keccak256('FEE_DISCOUNT_MANAGER');
  uint16 public constant override FEE_DISCOUNT_DENOMINATOR = 1000;

  // user => pool => feeDiscount
  mapping(address => mapping(address => uint16)) public override feeDiscounts;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  function setFeeDiscount(address user, address[] memory pools, uint16[] memory newDiscounts) external override {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(FEE_DISCOUNT_MANAGER, msg.sender), 'Unauthorized');
    require(pools.length == newDiscounts.length, 'ArraysLengthMismatch');

    for (uint i = 0; i < pools.length; i++) {
      require(newDiscounts[i] <= FEE_DISCOUNT_DENOMINATOR, 'fee discount execeeds 100%');
      feeDiscounts[user][pools[i]] = newDiscounts[i];
      emit FeeDiscount(user, pools[i], newDiscounts[i]);
    }
  }
}
