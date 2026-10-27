// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ISlidingFeePlugin.sol';
import './interfaces/ISlidingFeePluginImplementation.sol';
import './libraries/SlidingFeeStorage.sol';
import './libraries/SlidingFeeMath.sol';

/// @title SlidingFee Connector
/// @notice This contract provides delegatecall interface to SlidingFee plugin implementation
abstract contract SlidingFeeConnector is ISlidingFeePlugin, BaseConnector {
  using Plugins for uint16;

  string internal constant SLIDING_FEE_MODULE_NAME = 'Sliding Fee Plugin';
  uint16 internal constant SLIDING_FEE_PLUGIN_CONFIG = uint16(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable slidingFeeImplementation;

  constructor(address _slidingFeeImplementation) {
    slidingFeeImplementation = _slidingFeeImplementation;
  }

  /// @notice Initialize SlidingFee plugin via delegatecall
  function _initializeSlidingFee(uint16 _baseFee) internal {
    _delegateCall(slidingFeeImplementation, abi.encodeCall(ISlidingFeePluginImplementation.initializeSlidingFee, (_baseFee)));
  }

  /// @notice Get fee and update factors via delegatecall
  function _getFeeAndUpdateFactors(bool zeroToOne, int24 currentTick, int24 lastTick) internal returns (uint16) {
    bytes memory returnData = _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.getFeeAndUpdateFactors, (zeroToOne, currentTick, lastTick))
    );
    return abi.decode(returnData, (uint16));
  }

  /// @notice Set price change factor via delegatecall
  function _setPriceChangeFactor(uint16 newPriceChangeFactor) internal {
    _delegateCall(slidingFeeImplementation, abi.encodeCall(ISlidingFeePluginImplementation.setPriceChangeFactor, (newPriceChangeFactor)));
  }

  /// @notice Set base fee via delegatecall
  function _setBaseFee(uint16 newBaseFee) internal {
    _delegateCall(slidingFeeImplementation, abi.encodeCall(ISlidingFeePluginImplementation.setBaseFee, (newBaseFee)));
  }

  // ###### View Methods (Direct Storage Access) ######

  /// @notice Get current fee for direction
  function _getCurrentFee(bool zeroToOne) internal view returns (uint16) {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    return SlidingFeeMath.adjustedFee(layout.baseFee, layout.feeFactors, zeroToOne);
  }

  /// @notice The fee _getFeeAndUpdateFactors would return, without writing the factors
  /// @dev For getSwapFee, which must quote the fee the swap applies
  function _quoteSlidingFee(bool zeroToOne, int24 currentTick, int24 lastTick) internal view returns (uint16) {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    SlidingFeeStorage.FeeFactors memory factors = layout.feeFactors;
    if (currentTick != lastTick) factors = SlidingFeeMath.moveFeeFactors(factors, currentTick, lastTick, layout.priceChangeFactor);
    return SlidingFeeMath.adjustedFee(layout.baseFee, factors, zeroToOne);
  }

  // ###### Public Interface (ISlidingFeePlugin) ######

  /// @inheritdoc ISlidingFeePlugin
  function priceChangeFactor() external view override returns (uint16) {
    return SlidingFeeStorage.layout().priceChangeFactor;
  }

  /// @inheritdoc ISlidingFeePlugin
  function baseFee() external view override returns (uint16) {
    return SlidingFeeStorage.layout().baseFee;
  }

  /// @inheritdoc ISlidingFeePlugin
  function feeFactors() external view override returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    SlidingFeeStorage.FeeFactors memory factors = SlidingFeeStorage.layout().feeFactors;
    return (factors.zeroToOneFeeFactor, factors.oneToZeroFeeFactor);
  }

  /// @inheritdoc ISlidingFeePlugin
  function setPriceChangeFactor(uint16 newPriceChangeFactor) external override {
    _authorize();
    _setPriceChangeFactor(newPriceChangeFactor);
    emit PriceChangeFactor(newPriceChangeFactor);
  }

  /// @inheritdoc ISlidingFeePlugin
  function setBaseFee(uint16 newBaseFee) external override {
    _authorize();
    _setBaseFee(newBaseFee);
    emit BaseFee(newBaseFee);
  }
}
