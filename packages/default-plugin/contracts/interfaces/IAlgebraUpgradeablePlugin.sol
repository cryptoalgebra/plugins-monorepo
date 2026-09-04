// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';

/// @title The interface for Algebra Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
interface IAlgebraUpgradeablePlugin {
  /// @notice Emitted when plugin is initialized
  /// @param pool The pool address
  event PluginInitialized(address indexed pool);

  /// @notice Initialize plugin with fee configuration, security registry and trading-hours defaults
  /// @param feeConfig The initial fee configuration
  /// @param securityRegistry The security registry address
  /// @param tradingHoursStartSeconds Default daily trading window start, UTC seconds from midnight
  /// @param tradingHoursEndSeconds Default daily trading window end, UTC seconds from midnight
  /// @param tradingHoursDayOfWeekOffsetSeconds Default offset for the blocked-weekdays local-day check
  /// @param tradingHoursBlockedWeekdaysMask Default always-blocked weekdays, bit i = weekday i (0 = Sunday)
  /// @param tradingHoursEnabled Whether trading hours restrictions start enabled
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    uint32 tradingHoursStartSeconds,
    uint32 tradingHoursEndSeconds,
    int32 tradingHoursDayOfWeekOffsetSeconds,
    uint8 tradingHoursBlockedWeekdaysMask,
    bool tradingHoursEnabled
  ) external;
}
