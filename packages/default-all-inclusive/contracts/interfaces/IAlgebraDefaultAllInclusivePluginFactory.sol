// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/limit-order-plugin/contracts/interfaces/ILimitOrderPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';
import '@cryptoalgebra/whitelist-fee-discount-plugin/contracts/interfaces/IFeeDiscountPluginFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the AlgebraDefaultPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IAlgebraDefaultAllInclusivePluginFactory is IBasePluginFactory, IDynamicFeePluginFactory, IFarmingPluginFactory, ISecurityPluginFactory, ILimitOrderPluginFactory, IFeeDiscountPluginFactory {

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraDefaultPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);
}
