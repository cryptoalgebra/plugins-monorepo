// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ITradingHoursPlugin.sol';
import './interfaces/ITradingHoursPluginImplementation.sol';
import './libraries/TradingHoursStorage.sol';
import './libraries/TradingHoursLib.sol';

/// @title Trading Hours Plugin Implementation
/// @notice Contains all business logic for Trading Hours verification, executed via delegatecall
/// @dev Trading hours and blocked windows are plain UTC. Weekends (Sat/Sun local) are always blocked
/// while enabled - see setEnabled. Additional per-day blocked windows can be set for holidays or
/// temporary closures.
contract TradingHoursPluginImplementation is ITradingHoursPluginImplementation {
  /// @notice Initialize Trading Hours plugin
  function initializeTradingHours(uint32 startSeconds, uint32 endSeconds, int32 weekendOffsetSeconds, bool enabled) external {
    _setTradingHours(startSeconds, endSeconds);
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.weekendOffsetSeconds = weekendOffsetSeconds;
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

  /// @notice Set the offset used only to find the local calendar day for the Sat/Sun rule
  function setWeekendOffset(int32 offsetSeconds) external {
    TradingHoursStorage.layout().weekendOffsetSeconds = offsetSeconds;
  }

  /// @notice Set or clear one of the blocked windows for a specific day
  function setBlockedWindow(uint256 day, uint8 index, uint24 startSeconds, uint24 endSeconds) external {
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

  function _setTradingHours(uint32 startSeconds, uint32 endSeconds) internal {
    if (startSeconds >= endSeconds || endSeconds > TradingHoursLib.SECONDS_PER_DAY) revert ITradingHoursPlugin.InvalidTradingHours();
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.tradingStartSeconds = startSeconds;
    l.tradingEndSeconds = endSeconds;
  }

  function _setBlockedWindow(uint256 day, uint8 index, uint24 startSeconds, uint24 endSeconds) internal {
    if (index >= TradingHoursLib.MAX_BLOCKED_WINDOWS_PER_DAY) revert ITradingHoursPlugin.InvalidBlockedWindowIndex();
    bool isClear = startSeconds == 0 && endSeconds == 0;
    if (!isClear && startSeconds >= endSeconds) revert ITradingHoursPlugin.InvalidBlockedWindowRange();

    uint256 key = TradingHoursLib.dayStart(day);
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.blockedWindows[key] = TradingHoursLib.packBlockedWindow(l.blockedWindows[key], index, startSeconds, endSeconds);
  }
}
