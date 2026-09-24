// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Upgradeable plugin with VolatilityOracle, FarmingProxy, Security and Price Convergence
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with security registry
  /// @param securityRegistry The security registry address
  function initialize(address securityRegistry) external;
}
