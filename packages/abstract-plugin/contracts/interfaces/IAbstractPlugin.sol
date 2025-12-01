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

  /// @notice Get all active module names
  /// @return moduleNames Array of active module names
  function getActiveModuleNames() external view returns (string[] memory moduleNames);

  /// @notice Get count of active modules
  /// @return Number of active modules
  function getActiveModulesCount() external view returns (uint256);

  /// @notice Get module name by index
  /// @param index Index of module
  /// @return Module name
  function getModuleName(uint256 index) external view returns (string memory);
}
