// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './TradingHoursStorage.sol';

/// @dev Core trading-hours computation, shared by the connector (direct view reads)
/// and the implementation (delegatecall writes and the swap-path check).
library TradingHoursLib {
  uint256 internal constant SECONDS_PER_DAY = 1 days;
  uint8 internal constant MAX_BLOCKED_WINDOWS_PER_DAY = 5;
  uint256 internal constant WINDOW_BITS = 48; // 24 bits start + 24 bits end
  uint256 internal constant WINDOW_MASK = (1 << WINDOW_BITS) - 1;

  function localTimestamp(int32 offsetSeconds, uint256 timestamp) internal pure returns (uint256) {
    return uint256(int256(timestamp) + int256(offsetSeconds));
  }

  /// @dev Floors a timestamp to the start of its UTC day - the blockedWindows mapping key.
  /// Callers pass any timestamp within the target day, not a day count, so there's nothing to get wrong.
  function dayStart(uint256 timestamp) internal pure returns (uint256) {
    return (timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  }

  /// @dev A disabled module allows everything, including the blocked-weekdays rule. Otherwise: trading
  /// hours and blocked windows are plain UTC, only the weekday check needs local time, since it must line
  /// up with the actual local calendar day.
  function isTradingAllowed(TradingHoursStorage.Layout storage l, uint256 timestamp) internal view returns (bool) {
    if (!l.enabled) return true;

    uint256 secondsInDay = timestamp % SECONDS_PER_DAY;
    if (secondsInDay < l.tradingStartSeconds || secondsInDay >= l.tradingEndSeconds) return false;

    // day count (not a timestamp) purely for the +4 % 7 weekday formula, never exposed externally
    uint256 dayOfWeekCount = localTimestamp(l.dayOfWeekOffsetSeconds, timestamp) / SECONDS_PER_DAY;
    uint256 dayOfWeek = (dayOfWeekCount + 4) % 7; // 0 = Sunday
    if ((l.blockedWeekdaysMask >> dayOfWeek) & 1 != 0) return false;

    uint256 packed = l.blockedWindows[dayStart(timestamp)];
    if (packed == 0) return true;

    unchecked {
      for (uint256 i; i < MAX_BLOCKED_WINDOWS_PER_DAY; i++) {
        uint256 window = (packed >> (i * WINDOW_BITS)) & WINDOW_MASK;
        if (window == 0) break;
        uint256 start = window >> 24;
        uint256 end = window & 0xFFFFFF;
        if (secondsInDay >= start && secondsInDay < end) return false;
      }
    }
    return true;
  }

  function unpackWindow(uint256 packed, uint8 index) internal pure returns (uint24 startSeconds, uint24 endSeconds) {
    uint256 window = (packed >> (uint256(index) * WINDOW_BITS)) & WINDOW_MASK;
    startSeconds = uint24(window >> 24);
    endSeconds = uint24(window & 0xFFFFFF);
  }

  function packBlockedWindow(uint256 packed, uint8 index, uint24 startSeconds, uint24 endSeconds) internal pure returns (uint256) {
    uint256 shift = uint256(index) * WINDOW_BITS;
    uint256 mask = WINDOW_MASK << shift;
    uint256 window = (uint256(startSeconds) << 24) | uint256(endSeconds);
    return (packed & ~mask) | (window << shift);
  }
}
