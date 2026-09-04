// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/trading-hours-plugin/contracts/libraries/TradingHoursStorage.sol';

import './MockTimeAlgebraUpgradeablePlugin.sol';

/// @title Plugin that can put a proxy back into the pre-Trading-Hours storage shape
/// @notice A plugin created by an implementation that had no Trading Hours module carries an all-zero
/// Trading Hours namespace, because its `initialize` never wrote one - which is the state every plugin
/// already deployed will be in on the day the beacon is upgraded. No such implementation is left in
/// this repository, so tests reach that state by upgrading a live proxy to this one, wiping the
/// namespace, and upgrading back: storage is storage, and the result is what an old proxy carries.
contract MockPreTradingHoursPlugin is MockTimeAlgebraUpgradeablePlugin {
  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl,
    address _tradingHoursImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      _tradingHoursImpl
    )
  {}

  /// @notice Clears every Trading Hours field this proxy holds
  /// @dev Only the scalars: a plugin that never had the module has no blocked windows to clear either
  function wipeTradingHours() external {
    TradingHoursStorage.Layout storage l = TradingHoursStorage.layout();
    l.tradingStartSeconds = 0;
    l.tradingEndSeconds = 0;
    l.dayOfWeekOffsetSeconds = 0;
    l.enabled = false;
    l.blockedWeekdaysMask = 0;
  }
}
