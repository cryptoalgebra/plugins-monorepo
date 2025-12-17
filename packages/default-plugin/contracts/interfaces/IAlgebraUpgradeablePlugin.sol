// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {

  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with pool and fee configuration
  /// @param pool The Algebra pool address
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param rebalanceManager The ALM rebalance manager address
  /// @param slowTwapPeriod Slow TWAP period in seconds for ALM
  /// @param fastTwapPeriod Fast TWAP period in seconds for ALM
  function initialize(
    address pool,
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address rebalanceManager,
    uint32 slowTwapPeriod,
    uint32 fastTwapPeriod
  ) external;
}
