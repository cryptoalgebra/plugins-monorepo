// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;
pragma abicoder v2;

/// @title The interface for the Trading Hours plugin factory
interface ITradingHoursPluginFactory {
  /// @notice Emitted when the default trading-hours configuration is changed
  event DefaultTradingHours(
    uint32 startSeconds,
    uint32 endSeconds,
    int32 dayOfWeekOffsetSeconds,
    uint8 blockedWeekdaysMask,
    bool enabled
  );

  /// @notice Current default trading-hours configuration, applied to newly created pools
  /// @dev A pool's admin can still change its own configuration afterwards via the connector's setters
  function defaultTradingHours()
    external
    view
    returns (
      uint32 startSeconds,
      uint32 endSeconds,
      int32 dayOfWeekOffsetSeconds,
      uint8 blockedWeekdaysMask,
      bool enabled
    );

  /// @notice Changes the default trading-hours configuration for newly created pools
  /// @dev Same validation as TradingHoursConnector.setTradingHours/setBlockedWeekdays
  function setDefaultTradingHours(
    uint32 startSeconds,
    uint32 endSeconds,
    int32 dayOfWeekOffsetSeconds,
    uint8 blockedWeekdaysMask,
    bool enabled
  ) external;
}
