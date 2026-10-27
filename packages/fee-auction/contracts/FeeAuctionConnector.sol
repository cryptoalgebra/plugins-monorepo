// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IFeeAuctionPlugin.sol';
import './interfaces/IFeeAuctionPluginImplementation.sol';
import './libraries/FeeAuctionStorage.sol';
import './libraries/FeeAuctionMath.sol';

/// @title FeeAuction Connector
/// @notice This contract provides delegatecall interface to FeeAuction plugin implementation
abstract contract FeeAuctionConnector is BaseConnector, IFeeAuctionPlugin {
  using Plugins for uint16;

  string internal constant FEE_AUCTION_MODULE_NAME = 'Fee Auction Plugin';
  uint16 internal constant FEE_AUCTION_PLUGIN_CONFIG = uint16(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable feeAuctionImplementation;

  constructor(address _feeAuctionImplementation) {
    feeAuctionImplementation = _feeAuctionImplementation;
  }

  // ##### Internal methods for hooks #####

  /// @notice Get the MEV tax via delegatecall to implementation
  /// @return mevTax The MEV tax of the current transaction
  function _getAuctionFee() internal returns (uint24 mevTax) {
    bytes memory returnData = _delegateCall(feeAuctionImplementation, abi.encodeCall(IFeeAuctionPluginImplementation.getAuctionFee, ()));
    return abi.decode(returnData, (uint24));
  }

  /// @notice The swap fee: the base fee with the MEV tax on top
  /// @dev The pool reverts the swap if the sum reaches 1e6
  function _getFeeAuctionSwapFee() internal returns (uint24) {
    return FeeAuctionStorage.layout().baseFee + _getAuctionFee();
  }

  /// @notice The fee _getFeeAuctionSwapFee would return, for getSwapFee
  /// @dev The tax follows the priority fee of the swap. A quote without a gas price names the base fee alone
  function _quoteFeeAuctionSwapFee() internal view returns (uint24) {
    FeeAuctionStorage.Layout storage s = FeeAuctionStorage.layout();
    return s.baseFee + FeeAuctionMath.mevTax(s);
  }

  /// @notice Initialize fee auction storage parameters via delegatecall
  function _initializeFeeAuction(uint24 _baseFee, uint24 _mevTaxMultiplier, uint24 _maxMevTax, bool _mevTaxEnabled) internal {
    _delegateCall(
      feeAuctionImplementation,
      abi.encodeCall(IFeeAuctionPluginImplementation.initializeFeeAuction, (_baseFee, _mevTaxMultiplier, _maxMevTax, _mevTaxEnabled))
    );
  }

  // ##### Public Interface (IFeeAuctionPlugin) #####

  /// @inheritdoc IFeeAuctionPlugin
  function baseFee() external view override returns (uint24) {
    return FeeAuctionStorage.layout().baseFee;
  }

  /// @inheritdoc IFeeAuctionPlugin
  function mevTaxMultiplier() external view override returns (uint24) {
    return FeeAuctionStorage.layout().mevTaxMultiplier;
  }

  /// @inheritdoc IFeeAuctionPlugin
  function maxMevTax() external view override returns (uint24) {
    return FeeAuctionStorage.layout().maxMevTax;
  }

  /// @inheritdoc IFeeAuctionPlugin
  function mevTaxEnabled() external view override returns (bool) {
    return FeeAuctionStorage.layout().mevTaxEnabled;
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setBaseFee(uint24 newBaseFee) external override {
    _authorize();
    _delegateCall(feeAuctionImplementation, abi.encodeCall(IFeeAuctionPluginImplementation.setBaseFee, (newBaseFee)));
    emit BaseFeeChanged(newBaseFee);
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setMevTaxParameters(uint24 newMevTaxMultiplier, uint24 newMaxMevTax) external override {
    _authorize();
    _delegateCall(
      feeAuctionImplementation,
      abi.encodeCall(IFeeAuctionPluginImplementation.setMevTaxParameters, (newMevTaxMultiplier, newMaxMevTax))
    );
    emit MevTaxParametersChanged(newMevTaxMultiplier, newMaxMevTax);
  }

  /// @inheritdoc IFeeAuctionPlugin
  function setMevTaxEnabled(bool enabled) external override {
    _authorize();
    _delegateCall(feeAuctionImplementation, abi.encodeCall(IFeeAuctionPluginImplementation.setMevTaxEnabled, (enabled)));
    emit MevTaxEnabledChanged(enabled);
  }
}
