// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Upgradeable plugin with VolatilityOracle, FarmingProxy, Security, Limit Order and Permissioned Pool
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with security registry, allowlist checker registry and limit order manager
  /// @param securityRegistry The security registry address
  /// @param allowlistCheckerRegistry The allowlist checker registry address for the Permissioned Pool module
  /// @param limitOrderManager The limit order manager address for the Limit Order module
  function initialize(address securityRegistry, address allowlistCheckerRegistry, address limitOrderManager) external;
}
