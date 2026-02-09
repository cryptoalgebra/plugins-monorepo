// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IFeeAuctionPlugin.sol';
import './interfaces/IFeeAuctionPluginImplementation.sol';
import './libraries/FeeAuctionStorage.sol';

/// @title FeeAuction Connector
/// @notice This contract provides delegatecall interface to FeeAuction plugin implementation
abstract contract FeeAuctionConnector is BaseConnector, IFeeAuctionPlugin {
  using Plugins for uint8;

  string internal constant FEE_AUCTION_MODULE_NAME = 'Fee Auction Plugin';
  uint8 internal constant FEE_AUCTION_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable feeAuctionImplementation;

  constructor(address _feeAuctionImplementation) {
    feeAuctionImplementation = _feeAuctionImplementation;
  }

  // ##### Internal methods for hooks #####

  /// @notice Get the MEV tax plugin fee via delegatecall to implementation
  /// @return pluginFee The calculated MEV tax plugin fee
  function _getAuctionFee() internal returns (uint24 pluginFee) {
    bytes memory returnData = _delegateCall(
      feeAuctionImplementation,
      abi.encodeCall(IFeeAuctionPluginImplementation.getAuctionFee, ())
    );
    return abi.decode(returnData, (uint24));
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
    _delegateCall(
      feeAuctionImplementation,
      abi.encodeCall(IFeeAuctionPluginImplementation.setBaseFee, (newBaseFee))
    );
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
    _delegateCall(
      feeAuctionImplementation,
      abi.encodeCall(IFeeAuctionPluginImplementation.setMevTaxEnabled, (enabled))
    );
    emit MevTaxEnabledChanged(enabled);
  }
}
