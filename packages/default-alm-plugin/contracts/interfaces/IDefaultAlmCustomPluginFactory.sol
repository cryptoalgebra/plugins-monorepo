// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';

/// @title The interface for the IDefaultAlmCustomPluginFactory
interface IDefaultAlmCustomPluginFactory is IAlgebraPluginFactory, IDynamicFeePluginFactory, IFarmingPluginFactory, ISecurityPluginFactory {

  /// @notice Emitted when the default router address is changed
  /// @param newRouter The new default router address
  event DefaultRouter(address newRouter);

  /// @notice Emitted when the default config ID is changed
  /// @param newConfigId The new default config ID
  event DefaultConfigId(bytes32 newConfigId);

  /// @notice The hash of 'ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraALMCustomPluginFactory
  function ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Returns the address of AlgebraFactory
  /// @return The AlgebraFactory contract address
  function algebraFactory() external view returns (address);

  /// @notice Returns the address of entryPoint
  /// @return The entryPoint contract address
  function entryPoint() external view returns (address);

  /// @notice Returns address of plugin created for given AlgebraPool
  /// @param pool The address of AlgebraPool
  /// @return The address of corresponding plugin
  function pluginByPool(address pool) external view returns (address);

  /// @notice Create custom pool
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external returns (address customPool);

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