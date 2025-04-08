// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';

/// @title The interface for the BasePluginFactory
interface IBasePluginFactory is IAlgebraPluginFactory {
  /// @notice Returns the address of AlgebraCustomPoolEntryPoint
  /// @dev This is a main entry point for creating, managing plugins
  /// @return The AlgebraCustomPoolEntryPoint contract address
  function entryPoint() external view returns (address);

  /// @notice Create a custom pool with a plugin
  /// @param creator The address that initiated the pool creation
  /// @param tokenA The address of first token in pool
  /// @param tokenB The address of second token in pool
  /// @param data The data to be passed to beforeCreatePoolHook
  /// @return customPool The address of created plugin
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external returns (address customPool);

  /// @notice Sets tick spacing in a deployed custom pool
  /// @param pool The address of custom pool
  /// @param newTickSpacing The new tick spacing
  function setTickSpacing(address pool, int24 newTickSpacing) external;

  /// @notice Sets plugin in a deployed custom pool
  /// @param pool The address of custom pool
  /// @param newPluginAddress The new plugin
  function setPlugin(address pool, address newPluginAddress) external;

  /// @notice Sets plugin config in a deployed custom pool
  /// @param pool The address of custom pool
  /// @param newConfig The new config
  function setPluginConfig(address pool, uint8 newConfig) external;

  /// @notice Sets fee in a deployed custom pool
  /// @param pool The address of custom pool
  /// @param newFee The new fee
  function setFee(address pool, uint16 newFee) external;
}
