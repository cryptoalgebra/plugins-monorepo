// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration, security registry, and optional Reflex defaults
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param reflexRouter The default Reflex router
  /// @param reflexConfigId The default Reflex config id
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address reflexRouter,
    bytes32 reflexConfigId
  ) external;
}
