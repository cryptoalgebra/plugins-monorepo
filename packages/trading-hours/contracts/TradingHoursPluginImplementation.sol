// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ITradingHoursPlugin.sol';
import './interfaces/ITradingHoursPluginImplementation.sol';
import './libraries/TradingHoursStorage.sol';
import './libraries/TradingHoursLib.sol';

/// @title Trading Hours Plugin Implementation
/// @notice Contains all business logic for Trading Hours verification, executed via delegatecall
/// @dev Trading hours and blocked windows are plain UTC. Configured weekdays (see setBlockedWeekdays)
/// are always blocked while enabled - see setEnabled. Additional per-day blocked windows can be set
/// for holidays or temporary closures.
contract TradingHoursPluginImplementation is ITradingHoursPluginImplementation {
  /// @dev Only bits 0-6 (Sunday to Saturday) may be set
  uint8 internal constant BLOCKED_WEEKDAYS_MASK_LIMIT = 1 << 7;

  /// @notice Initialize Trading Hours plugin
  function initializeTradingHours(
    uint32 startSeconds,
    uint32 endSeconds,
    int32 dayOfWeekOffsetSeconds,
    uint8 blockedWeekdaysMask,
    bool enabled
  ) external {
    _setTradingHours(startSeconds, endSeconds);
    _setBlockedWeekdays(blockedWeekdaysMask);
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.dayOfWeekOffsetSeconds = dayOfWeekOffsetSeconds;
    l.enabled = enabled;
  }

  /// @notice Turn the module on or off
  function setEnabled(bool enabled) external {
    TradingHoursStorage.layout().enabled = enabled;
  }

  /// @notice Set the daily trading window
  function setTradingHours(uint32 startSeconds, uint32 endSeconds) external {
    _setTradingHours(startSeconds, endSeconds);
  }

  /// @notice Set the offset used only to find the local calendar day for the blocked-weekdays rule
  function setDayOfWeekOffset(int32 offsetSeconds) external {
    TradingHoursStorage.layout().dayOfWeekOffsetSeconds = offsetSeconds;
  }

  /// @notice Set which local weekdays are always blocked
  function setBlockedWeekdays(uint8 mask) external {
    _setBlockedWeekdays(mask);
  }

  /// @notice Set or clear one of the blocked windows for a specific day
  function setBlockedWindow(uint32 day, uint8 index, uint24 startSeconds, uint24 endSeconds) external {
    _setBlockedWindow(day, index, startSeconds, endSeconds);
  }

  /// @notice Set or clear multiple blocked windows, across any mix of days and slots, in one transaction
  function setBlockedWindows(ITradingHoursPlugin.BlockedWindowInput[] calldata inputs) external {
    for (uint256 i; i < inputs.length; i++) {
      ITradingHoursPlugin.BlockedWindowInput calldata input = inputs[i];
      _setBlockedWindow(input.day, input.index, input.startSeconds, input.endSeconds);
    }
  }

  /// @inheritdoc ITradingHoursPluginImplementation
  function verifyTrading() external view {
    if (!TradingHoursLib.isTradingAllowed(TradingHoursStorage.layout(), block.timestamp)) revert ITradingHoursPlugin.TradingNotAllowed();
  }

  /// @notice Returns whether trading is allowed at the given timestamp
  /// @dev Not part of the delegatecall interface (the connector reads storage directly for this) - exposed
  /// here too so tests can deploy this contract standalone and query it without a connector/pool
  function isTradingAllowed(uint256 timestamp) external view returns (bool) {
    return TradingHoursLib.isTradingAllowed(TradingHoursStorage.layout(), timestamp);
  }

  /// @dev Same rationale as isTradingAllowed above - mirrors the connector's direct-storage-read getters
  /// so a standalone instance is fully queryable without a connector/pool
  function getEnabled() external view returns (bool) {
    return TradingHoursStorage.layout().enabled;
  }

  function getTradingHours() external view returns (uint32 startSeconds, uint32 endSeconds) {
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    return (l.tradingStartSeconds, l.tradingEndSeconds);
  }

  function getDayOfWeekOffset() external view returns (int32) {
    return TradingHoursStorage.layout().dayOfWeekOffsetSeconds;
  }

  function getBlockedWeekdays() external view returns (uint8) {
    return TradingHoursStorage.layout().blockedWeekdaysMask;
  }

  function getBlockedWindow(uint32 day, uint8 index) external view returns (uint24 startSeconds, uint24 endSeconds) {
    return TradingHoursLib.unpackWindow(TradingHoursStorage.layout().blockedWindows[TradingHoursLib.dayStart(day)], index);
  }

  function _setTradingHours(uint32 startSeconds, uint32 endSeconds) internal {
    if (startSeconds >= endSeconds || endSeconds > TradingHoursLib.SECONDS_PER_DAY) revert ITradingHoursPlugin.InvalidTradingHours();
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.tradingStartSeconds = startSeconds;
    l.tradingEndSeconds = endSeconds;
  }

  function _setBlockedWeekdays(uint8 mask) internal {
    if (mask >= BLOCKED_WEEKDAYS_MASK_LIMIT) revert ITradingHoursPlugin.InvalidBlockedWeekdaysMask();
    TradingHoursStorage.layout().blockedWeekdaysMask = mask;
  }

  function _setBlockedWindow(uint32 day, uint8 index, uint24 startSeconds, uint24 endSeconds) internal {
    if (index >= TradingHoursLib.MAX_BLOCKED_WINDOWS_PER_DAY) revert ITradingHoursPlugin.InvalidBlockedWindowIndex();
    bool isClear = startSeconds == 0 && endSeconds == 0;
    if (!isClear && startSeconds >= endSeconds) revert ITradingHoursPlugin.InvalidBlockedWindowRange();

    uint256 key = TradingHoursLib.dayStart(day);
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.blockedWindows[key] = TradingHoursLib.packBlockedWindow(l.blockedWindows[key], index, startSeconds, endSeconds);
  }
}
