// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
/// @title The interface for the DefaultAlmPluginFactory
/// @notice This contract creates Algebra default plugins for Algebra liquidity pools
interface IDefaultAlmPluginFactory is IBasePluginFactory, IDynamicFeePluginFactory, IFarmingPluginFactory, ISecurityPluginFactory {

  /// @notice Emitted when the default router address is changed
  /// @param newRouter The new default router address
  event DefaultRouter(address newRouter);

  /// @notice Emitted when the default config ID is changed
  /// @param newConfigId The new default config ID
  event DefaultConfigId(bytes32 newConfigId);

  /// @notice The hash of 'ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR' used as role
  /// @dev allows to change settings of DefaultAlmPluginFactory
  function ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Returns the default router address used for new plugins
  /// @return The default router contract address
  function defaultRouter() external view returns (address);

  /// @notice Returns the default config ID used for new plugins
  /// @return The default config ID
  function defaultConfigId() external view returns (bytes32);

  /// @notice Sets the default router address for new plugins
  /// @param newRouter The new router address to set
  function setRouter(address newRouter) external;

  /// @notice Sets the default config ID for new plugins
  /// @param newConfigId The new config ID to set
  function setConfigId(bytes32 newConfigId) external;

}
