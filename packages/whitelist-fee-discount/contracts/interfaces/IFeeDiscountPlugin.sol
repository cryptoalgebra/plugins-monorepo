// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IAbstractPlugin.sol';

interface IFeeDiscountPlugin is IAbstractPlugin {
  function setFeeDiscountRegistry(address registry) external;

  function feeDiscountRegistry() external returns (address);

  event FeeDiscountRegistry(address registry);
}
