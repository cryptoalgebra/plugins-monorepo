// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../FeeAuctionPlugin.sol';

/// @title Fee Auction Plugin Test Harness
/// @notice Test wrapper for FeeAuctionPlugin that bypasses authorization
contract FeeAuctionPluginTest is FeeAuctionPlugin {
  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    uint24 _baseFee,
    uint24 _mevTaxMultiplier,
    uint24 _maxMevTax,
    bool _mevTaxEnabled
  ) FeeAuctionPlugin(_pool, _factory, _pluginFactory, _baseFee, _mevTaxMultiplier, _maxMevTax, _mevTaxEnabled) {}

  /// @notice Exposes MEV tax calculation for testing
  function calculateMevTax() external view returns (uint24) {
    return _calculateMevTax();
  }

  /// @notice Override authorization for testing
  function _authorize() internal view override {}
}
