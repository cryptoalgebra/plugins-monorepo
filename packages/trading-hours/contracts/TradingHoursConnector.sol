// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ITradingHoursPlugin.sol';
import './interfaces/ITradingHoursPluginImplementation.sol';
import './libraries/TradingHoursStorage.sol';
import './libraries/TradingHoursLib.sol';

/// @title Trading Hours Connector
/// @notice Delegatecall interface to Trading Hours plugin implementation
/// @dev Blocks swap outside configured trading hours, while enabled. Flash and liquidity operations
/// (add and remove) are always allowed.
/// Trading hours and blocked windows are plain UTC. Weekends (Sat/Sun local) are always blocked while enabled.
abstract contract TradingHoursConnector is BaseConnector, ITradingHoursPlugin {
  using Plugins for uint8;

  string internal constant TRADING_HOURS_MODULE_NAME = 'Trading Hours Plugin';
  uint8 internal constant TRADING_HOURS_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG);

  address internal immutable tradingHoursImplementation;

  constructor(address _tradingHoursImplementation) {
    tradingHoursImplementation = _tradingHoursImplementation;
  }

  function _initializeTradingHours(uint32 startSeconds, uint32 endSeconds, int32 weekendOffsetSeconds, bool enabled) internal {
    _delegateCall(
      tradingHoursImplementation,
      abi.encodeCall(ITradingHoursPluginImplementation.initializeTradingHours, (startSeconds, endSeconds, weekendOffsetSeconds, enabled))
    );
  }

  /// @dev Reverts if trading is not allowed at block.timestamp. Call from the beforeSwap hook.
  /// Checks enabled directly first, so a disabled pool never pays for the delegatecall
  function _verifyTrading() internal {
    if (!TradingHoursStorage.layout().enabled) return;
    _delegateCall(tradingHoursImplementation, abi.encodeCall(ITradingHoursPluginImplementation.verifyTrading, ()));
  }

  /// @inheritdoc ITradingHoursPlugin
  function setEnabled(bool enabled) external override {
    _authorize();
    _delegateCall(tradingHoursImplementation, abi.encodeCall(ITradingHoursPluginImplementation.setEnabled, (enabled)));
    emit EnabledUpdated(enabled);
  }

  /// @inheritdoc ITradingHoursPlugin
  function setTradingHours(uint32 startSeconds, uint32 endSeconds) external override {
    _authorize();
    _delegateCall(tradingHoursImplementation, abi.encodeCall(ITradingHoursPluginImplementation.setTradingHours, (startSeconds, endSeconds)));
    emit TradingHoursUpdated(startSeconds, endSeconds);
  }

  /// @inheritdoc ITradingHoursPlugin
  function setWeekendOffset(int32 offsetSeconds) external override {
    _authorize();
    _delegateCall(tradingHoursImplementation, abi.encodeCall(ITradingHoursPluginImplementation.setWeekendOffset, (offsetSeconds)));
    emit WeekendOffsetUpdated(offsetSeconds);
  }

  /// @inheritdoc ITradingHoursPlugin
  function setBlockedWindow(uint32 day, uint8 index, uint24 startSeconds, uint24 endSeconds) external override {
    _authorize();
    _delegateCall(
      tradingHoursImplementation,
      abi.encodeCall(ITradingHoursPluginImplementation.setBlockedWindow, (day, index, startSeconds, endSeconds))
    );
    emit BlockedWindowUpdated(uint32(TradingHoursLib.dayStart(day)), index, startSeconds, endSeconds);
  }

  /// @inheritdoc ITradingHoursPlugin
  function setBlockedWindows(BlockedWindowInput[] calldata inputs) external override {
    _authorize();
    _delegateCall(tradingHoursImplementation, abi.encodeCall(ITradingHoursPluginImplementation.setBlockedWindows, (inputs)));
    for (uint256 i; i < inputs.length; i++) {
      BlockedWindowInput calldata input = inputs[i];
      emit BlockedWindowUpdated(uint32(TradingHoursLib.dayStart(input.day)), input.index, input.startSeconds, input.endSeconds);
    }
  }

  /// @inheritdoc ITradingHoursPlugin
  function getEnabled() external view override returns (bool enabled) {
    return TradingHoursStorage.layout().enabled;
  }

  /// @inheritdoc ITradingHoursPlugin
  function getTradingHours() external view override returns (uint32 startSeconds, uint32 endSeconds) {
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    return (l.tradingStartSeconds, l.tradingEndSeconds);
  }

  /// @inheritdoc ITradingHoursPlugin
  function getWeekendOffset() external view override returns (int32 offsetSeconds) {
    return TradingHoursStorage.layout().weekendOffsetSeconds;
  }

  /// @inheritdoc ITradingHoursPlugin
  function getBlockedWindow(uint32 day, uint8 index) external view override returns (uint24 startSeconds, uint24 endSeconds) {
    return TradingHoursLib.unpackWindow(TradingHoursStorage.layout().blockedWindows[TradingHoursLib.dayStart(day)], index);
  }

  /// @inheritdoc ITradingHoursPlugin
  function isTradingAllowed(uint256 timestamp) public view override returns (bool) {
    return TradingHoursLib.isTradingAllowed(TradingHoursStorage.layout(), timestamp);
  }
}
