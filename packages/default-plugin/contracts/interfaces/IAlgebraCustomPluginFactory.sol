// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/ICustomPluginFactory.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/interfaces/IDynamicFeePluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginFactory.sol';

/// @title The interface for the AlgebraCustomPluginFactory
/// @notice Creates Algebra default plugins for custom pools deployed through the AlgebraCustomPoolEntryPoint
interface IAlgebraCustomPluginFactory is ICustomPluginFactory, IDynamicFeePluginFactory, IFarmingPluginFactory, ISecurityPluginFactory {
  error OnlyAdministrator();
  error OnlyEntryPoint();
  error PluginAlreadyCreated();
  error FarmingAddressUnchanged();

  event PluginCreated(address indexed pool, address plugin);

  /// @notice The hash of 'ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR' used as role
  /// @dev Allows to change settings of AlgebraCustomPluginFactory and its custom pools
  // solhint-disable-next-line func-name-mixedcase
  function ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR() external pure returns (bytes32);

  /// @notice Returns the address of AlgebraFactory
  /// @dev Taken from the entry point, used for role checks
  /// @return The AlgebraFactory contract address
  function algebraFactory() external view returns (address);

  /// @notice Returns address of plugin created for given custom pool
  /// @param pool The address of the custom pool
  /// @return The address of corresponding plugin
  function pluginByPool(address pool) external view returns (address);
}
