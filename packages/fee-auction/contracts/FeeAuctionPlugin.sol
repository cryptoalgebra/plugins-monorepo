// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/IFeeAuctionPlugin.sol';

/// @title Fee Auction Plugin
/// @notice A plugin that implements MEV tax based on transaction priority fee
/// @dev The MEV tax is calculated as: min(priorityFee * mevTaxMultiplier / 1e18, maxMevTax)
contract FeeAuctionPlugin is BaseAbstractPlugin, IFeeAuctionPlugin {
  using Plugins for uint8;

  /// @dev Maximum allowed fee value (100%)
  uint24 private constant MAX_FEE = 1000000;

  /// @inheritdoc IFeeAuctionPlugin
  uint24 public override baseFee;

  /// @inheritdoc IFeeAuctionPlugin
  uint24 public override mevTaxMultiplier;

  /// @inheritdoc IFeeAuctionPlugin
  uint24 public override maxMevTax;

  /// @inheritdoc IFeeAuctionPlugin
  bool public override mevTaxEnabled;

  /// @notice Creates a new FeeAuctionPlugin
  /// @param _pool The Algebra pool address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _baseFee The initial base fee
  /// @param _mevTaxMultiplier The initial MEV tax multiplier
  /// @param _maxMevTax The initial maximum MEV tax
  /// @param _mevTaxEnabled Whether MEV tax is initially enabled
  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    uint24 _baseFee,
    uint24 _mevTaxMultiplier,
    uint24 _maxMevTax,
    bool _mevTaxEnabled
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) {
    require(_baseFee <= MAX_FEE, 'Base fee too high');
    require(_maxMevTax <= MAX_FEE, 'Max MEV tax too high');

    baseFee = _baseFee;
    mevTaxMultiplier = _mevTaxMultiplier;
    maxMevTax = _maxMevTax;
    mevTaxEnabled = _mevTaxEnabled;

    defaultPluginConfig = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setBaseFee(uint24 newBaseFee) external override {
    _authorize();
    require(newBaseFee <= MAX_FEE, 'Base fee too high');
    baseFee = newBaseFee;
    emit BaseFeeChanged(newBaseFee);
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setMevTaxParameters(uint24 newMevTaxMultiplier, uint24 newMaxMevTax) external override {
    _authorize();
    require(newMaxMevTax <= MAX_FEE, 'Max MEV tax too high');
    mevTaxMultiplier = newMevTaxMultiplier;
    maxMevTax = newMaxMevTax;
    emit MevTaxParametersChanged(newMevTaxMultiplier, newMaxMevTax);
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setMevTaxEnabled(bool enabled) external override {
    _authorize();
    mevTaxEnabled = enabled;
    emit MevTaxEnabledChanged(enabled);
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    uint24 feeOverride = baseFee;
    uint24 pluginFee = 0;

    if (mevTaxEnabled) {
      pluginFee = _calculateMevTax();
    }

    return (IAlgebraPlugin.beforeSwap.selector, feeOverride, pluginFee);
  }

  /// @notice Calculates the MEV tax based on priority fee
  /// @return The calculated MEV tax
  function _calculateMevTax() internal view returns (uint24) {
    uint256 priorityFee = tx.gasprice - block.basefee;

    // Calculate MEV tax: priorityFee * mevTaxMultiplier / 1e18
    uint256 mevTax = (priorityFee * mevTaxMultiplier) / 1e18;

    // Cap at maxMevTax
    if (mevTax > maxMevTax) {
      mevTax = maxMevTax;
    }

    return uint24(mevTax);
  }
}
