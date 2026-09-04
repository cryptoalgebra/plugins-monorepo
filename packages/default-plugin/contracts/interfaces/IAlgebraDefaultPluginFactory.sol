// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';
import '@cryptoalgebra/trading-hours-plugin/contracts/interfaces/ITradingHoursPluginFactory.sol';
import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the AlgebraDefaultPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IAlgebraDefaultPluginFactory is
  IBasePluginFactory,
  IFarmingPluginFactory,
  IDynamicFeePluginFactory,
  ISecurityPluginFactory,
  ITradingHoursPluginFactory
{
  error OnlyAdministrator();
  error OnlyAlgebraFactory();
  error OnlyPoolsAdministrator();
  error PoolNotExist();
  error PluginAlreadyCreated();
  error FarmingAddressUnchanged();
  error InvalidAlmTwapPeriods();

  event PluginCreated(address indexed pool, address plugin);
  event RebalanceManager(address newRebalanceManager);
  event AlmTwapPeriods(uint32 slowPeriod, uint32 fastPeriod);

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraDefaultPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);
}
