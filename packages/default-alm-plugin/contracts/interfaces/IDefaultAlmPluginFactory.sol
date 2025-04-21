// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the DefaultAlmPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IDefaultAlmPluginFactory is IBasePluginFactory, IDynamicFeePluginFactory {

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of DefaultAlmPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);

}
