// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';

/// @title The interface for the IDefaultAlmCustomPoolDeployer
interface IDefaultAlmCustomPoolDeployer is IAlgebraPluginFactory, IDynamicFeePluginFactory {

  /// @notice The hash of 'ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR' used as role
  /// @dev allows to change settings of AlgebraALMCustomPoolDeployer
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

}