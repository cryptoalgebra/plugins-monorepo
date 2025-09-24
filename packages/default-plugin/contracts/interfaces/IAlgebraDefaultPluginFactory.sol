// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the AlgebraDefaultPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IAlgebraDefaultPluginFactory is IBasePluginFactory, IFarmingPluginFactory, IDynamicFeePluginFactory {

  /// @notice Emitted when the default router address is changed
  /// @param newRouter The new default router address
  event DefaultRouter(address newRouter);

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraDefaultPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Returns the default router address used for new plugins
  /// @return The default router contract address
  function defaultRouter() external view returns (address);

  /// @notice Returns the default configID used for new plugins
  /// @return The default configID
  function reflexConfigId() external view returns (bytes32);

  /// @notice Sets the default router address for new plugins
  /// @param newRouter The new router address to set
  function setRouter(address newRouter) external;

  /// @notice Sets the configID for new plugins
  /// @param _configId The new configID to set
  function setConfigId(bytes32 _configId) external;
}
