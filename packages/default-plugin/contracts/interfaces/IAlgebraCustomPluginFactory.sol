// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';

/// @title The interface for the AlgebraCustomPluginFactory
/// @notice Deploys Algebra upgradeable plugins for Algebra Integral custom pools created through the entry point.
/// @dev Mirrors the default plugin factory surface (farming, security, beacon upgrades), but pools are created via
/// the AlgebraCustomPoolEntryPoint instead of the AlgebraFactory.
interface IAlgebraCustomPluginFactory is IAlgebraPluginFactory, IFarmingPluginFactory, ISecurityPluginFactory {
  error OnlyAdministrator();
  error OnlyEntryPoint();
  error PluginAlreadyCreated();
  error FarmingAddressUnchanged();

  event PluginCreated(address indexed pool, address plugin);

  /// @notice The hash of 'ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR' used as role
  /// @dev Allows to change settings of AlgebraCustomPluginFactory
  function ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Returns the address of AlgebraFactory (used for role checks)
  /// @return The AlgebraFactory contract address
  function algebraFactory() external view returns (address);

  /// @notice Returns the address of AlgebraCustomPoolEntryPoint
  /// @dev The entry point used to create and manage custom pools
  /// @return The entry point contract address
  function entryPoint() external view returns (address);

  /// @notice Returns address of plugin created for given custom pool
  /// @param pool The address of the custom pool
  /// @return The address of the corresponding plugin
  function pluginByPool(address pool) external view returns (address);

  /// @notice Creates a custom pool with a plugin through the entry point, sets unit tick spacing and initializes it
  /// @param creator The address that initiated the pool creation
  /// @param tokenA The address of the first token in the pool
  /// @param tokenB The address of the second token in the pool
  /// @param sqrtPriceX96 The initial sqrt price (Q64.96) to initialize the pool with
  /// @param data The data passed to beforeCreatePoolHook
  /// @return customPool The address of the created custom pool
  function createCustomPoolAndInitialize(
    address creator,
    address tokenA,
    address tokenB,
    uint160 sqrtPriceX96,
    bytes calldata data
  ) external returns (address customPool);

  /// @notice Sets tick spacing in a deployed custom pool
  /// @param pool The address of the custom pool
  /// @param newTickSpacing The new tick spacing
  function setTickSpacing(address pool, int24 newTickSpacing) external;

  /// @notice Sets plugin address in a deployed custom pool
  /// @param pool The address of the custom pool
  /// @param newPluginAddress The new plugin address
  function setPlugin(address pool, address newPluginAddress) external;

  /// @notice Sets plugin config in a deployed custom pool
  /// @param pool The address of the custom pool
  /// @param newConfig The new plugin config bitmap
  function setPluginConfig(address pool, uint8 newConfig) external;

  /// @notice Sets fee in a deployed custom pool
  /// @param pool The address of the custom pool
  /// @param newFee The new fee value
  function setFee(address pool, uint16 newFee) external;
}
