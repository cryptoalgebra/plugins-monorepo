// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import './interfaces/IFeeAuctionPluginImplementation.sol';
import './libraries/FeeAuctionStorage.sol';
import './libraries/FeeAuctionMath.sol';

/// @title FeeAuction Plugin Implementation
/// @notice FeeAuction module logic using namespaced storage
/// @dev Executed via delegatecall from FeeAuctionConnector
contract FeeAuctionPluginImplementation is IFeeAuctionPluginImplementation {
  /// @dev Maximum allowed fee value (100%)
  uint24 private constant MAX_FEE = 1000000;

  /// @inheritdoc IFeeAuctionPluginImplementation
  function setBaseFee(uint24 newBaseFee) external override {
    require(newBaseFee <= MAX_FEE, 'Base fee too high');
    FeeAuctionStorage.layout().baseFee = newBaseFee;
  }

  /// @inheritdoc IFeeAuctionPluginImplementation
  function setMevTaxParameters(uint24 newMevTaxMultiplier, uint24 newMaxMevTax) external override {
    require(newMaxMevTax <= MAX_FEE, 'Max MEV tax too high');
    FeeAuctionStorage.Layout storage s = FeeAuctionStorage.layout();
    s.mevTaxMultiplier = newMevTaxMultiplier;
    s.maxMevTax = newMaxMevTax;
  }

  /// @inheritdoc IFeeAuctionPluginImplementation
  function setMevTaxEnabled(bool enabled) external override {
    FeeAuctionStorage.layout().mevTaxEnabled = enabled;
  }

  /// @inheritdoc IFeeAuctionPluginImplementation
  function getAuctionFee() external view override returns (uint24 mevTax) {
    return FeeAuctionMath.mevTax(FeeAuctionStorage.layout());
  }

  /// @inheritdoc IFeeAuctionPluginImplementation
  function initializeFeeAuction(uint24 _baseFee, uint24 _mevTaxMultiplier, uint24 _maxMevTax, bool _mevTaxEnabled) external override {
    require(_baseFee <= MAX_FEE, 'Base fee too high');
    require(_maxMevTax <= MAX_FEE, 'Max MEV tax too high');
    FeeAuctionStorage.Layout storage s = FeeAuctionStorage.layout();
    s.baseFee = _baseFee;
    s.mevTaxMultiplier = _mevTaxMultiplier;
    s.maxMevTax = _maxMevTax;
    s.mevTaxEnabled = _mevTaxEnabled;
  }
}
