// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title ITradingHoursPlugin
/// @notice Public interface for the Trading Hours plugin module
/// @dev Blocks swap, add liquidity and flash outside configured trading hours.
/// While disabled (see setEnabled), trading is fully unrestricted, including the weekend rule - the
/// connector checks this flag directly and skips the verification call entirely when disabled.
/// Once enabled: trading hours and blocked windows are plain UTC seconds-of-day. Weekends (Sat/Sun) are
/// always blocked and not configurable - the weekend offset only shifts which UTC day counts as local Sat/Sun.
/// Additional per-day blocked windows (holidays, temporary closures) can be set for specific UTC days.
/// Remove liquidity is always allowed.
interface ITradingHoursPlugin {
  /// @param day Any UTC timestamp within the target day - floored to the start of that day
  /// @param index Slot index, 0 to 4
  /// @param startSeconds UTC seconds from midnight when the window starts, inclusive. (0, 0) clears the slot
  /// @param endSeconds UTC seconds from midnight when the window ends, exclusive
  struct BlockedWindowInput {
    uint256 day;
    uint8 index;
    uint24 startSeconds;
    uint24 endSeconds;
  }

  /// @notice Emitted when the module is enabled or disabled
  event EnabledUpdated(bool enabled);

  /// @notice Emitted when the daily trading window is updated
  event TradingHoursUpdated(uint32 startSeconds, uint32 endSeconds);

  /// @notice Emitted when the weekend UTC offset is updated
  event WeekendOffsetUpdated(int32 offsetSeconds);

  /// @notice Emitted when a blocked window for a specific day is set or cleared
  /// @param day UTC timestamp of the start of the day this window applies to
  event BlockedWindowUpdated(uint256 indexed day, uint8 indexed index, uint24 startSeconds, uint24 endSeconds);

  /// @notice The current time falls outside the configured trading window
  error TradingNotAllowed();

  /// @notice startSeconds must be less than endSeconds, and endSeconds must be at most 1 days
  error InvalidTradingHours();

  /// @notice index must be less than the max number of blocked windows per day
  error InvalidBlockedWindowIndex();

  /// @notice startSeconds must be less than endSeconds, unless clearing the slot with (0, 0)
  error InvalidBlockedWindowRange();

  /// @notice Turn the module on or off. While disabled, trading is fully unrestricted (weekend rule
  /// included) - existing hours/offset/blocked-window configuration is kept, not cleared
  function setEnabled(bool enabled) external;

  /// @notice Set the daily trading window, in UTC seconds from midnight
  /// @param startSeconds UTC seconds from midnight when trading opens, inclusive
  /// @param endSeconds UTC seconds from midnight when trading closes, exclusive
  function setTradingHours(uint32 startSeconds, uint32 endSeconds) external;

  /// @notice Set the offset used only to find the local calendar day for the Sat/Sun rule
  /// @param offsetSeconds Offset in seconds, e.g. +10800 for UTC+3
  function setWeekendOffset(int32 offsetSeconds) external;

  /// @notice Set or clear one of the blocked windows for a specific day
  /// @dev Slots must be filled contiguously from index 0 - the read path stops scanning at the first
  /// empty (0, 0) slot, so clearing a slot before a later populated one makes the later slot unreachable.
  /// @param day Any UTC timestamp within the target day - floored to the start of that day
  /// @param index Slot index, 0 to 4
  /// @param startSeconds UTC seconds from midnight when the window starts, inclusive. (0, 0) clears the slot
  /// @param endSeconds UTC seconds from midnight when the window ends, exclusive
  function setBlockedWindow(uint256 day, uint8 index, uint24 startSeconds, uint24 endSeconds) external;

  /// @notice Set or clear multiple blocked windows, across any mix of days and slots, in one transaction
  function setBlockedWindows(BlockedWindowInput[] calldata inputs) external;

  /// @notice Returns whether the module is currently enabled
  function getEnabled() external view returns (bool enabled);

  /// @notice Returns the configured daily trading window, in UTC seconds from midnight
  function getTradingHours() external view returns (uint32 startSeconds, uint32 endSeconds);

  /// @notice Returns the configured weekend offset
  function getWeekendOffset() external view returns (int32 offsetSeconds);

  /// @notice Returns one of the blocked windows for a specific day
  /// @param day Any UTC timestamp within the target day - floored to the start of that day
  /// @param index Slot index, 0 to 4
  function getBlockedWindow(uint256 day, uint8 index) external view returns (uint24 startSeconds, uint24 endSeconds);

  /// @notice Returns whether trading is allowed at the given timestamp
  /// @param timestamp UTC timestamp to check
  function isTradingAllowed(uint256 timestamp) external view returns (bool);
}
