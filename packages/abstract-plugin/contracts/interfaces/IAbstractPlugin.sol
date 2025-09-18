// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

/// @title The interface for the BasePlugin
interface IAbstractPlugin is IAlgebraPlugin {
  /// @notice Claim plugin fee
  /// @param token The token address
  /// @param amount Amount of tokens
  /// @param recipient Recipient address
  function collectPluginFee(address token, uint256 amount, address recipient) external;

  /// @notice Get the number of active modules
  /// @return The number of active modules
  function getActiveModulesCount() external view returns (uint256);

  /// @notice Get the name of a module by index
  /// @param index The index of the module
  /// @return The name of the module
  function getModuleName(uint256 index) external view returns (string memory);

  /// @notice Get all active module names
  /// @return moduleNames Array of active module names
  function getActiveModuleNames() external view returns (string[] memory moduleNames);
}
