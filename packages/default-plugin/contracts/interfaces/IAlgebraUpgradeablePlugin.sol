// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration, security registry and allowlist checker registry
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param allowlistCheckerRegistry The allowlist checker registry address for the Permissioned Pool module
  function initialize(AlgebraFeeConfiguration calldata feeConfig, address securityRegistry, address allowlistCheckerRegistry) external;
}
