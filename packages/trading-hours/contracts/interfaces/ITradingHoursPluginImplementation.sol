// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './ITradingHoursPlugin.sol';

/// @title ITradingHoursPluginImplementation
/// @notice Interface for Trading Hours plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in TradingHoursConnector.
interface ITradingHoursPluginImplementation {
  function initializeTradingHours(uint32 startSeconds, uint32 endSeconds, int32 weekendOffsetSeconds, bool enabled) external;
  function setEnabled(bool enabled) external;
  function setTradingHours(uint32 startSeconds, uint32 endSeconds) external;
  function setWeekendOffset(int32 offsetSeconds) external;
  function setBlockedWindow(uint32 day, uint8 index, uint24 startSeconds, uint24 endSeconds) external;
  function setBlockedWindows(ITradingHoursPlugin.BlockedWindowInput[] calldata inputs) external;

  /// @notice Verify trading is allowed at block.timestamp - reverts if not
  function verifyTrading() external view;
}
