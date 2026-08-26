// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Upgradeable plugin with VolatilityOracle, FarmingProxy, Security, Price Convergence and Permissioned Pool
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with security registry and allowlist checker registry
  /// @param securityRegistry The security registry address
  /// @param allowlistCheckerRegistry The allowlist checker registry address for the Permissioned Pool module
  function initialize(address securityRegistry, address allowlistCheckerRegistry) external;
}
