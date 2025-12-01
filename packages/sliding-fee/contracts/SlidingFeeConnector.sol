// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ISlidingFeePlugin.sol';
import './interfaces/ISlidingFeePluginImplementation.sol';

/// @title SlidingFee Connector
/// @notice This contract provides delegatecall interface to SlidingFee plugin implementation
/// @dev Inherits from ISlidingFeePlugin and provides all public methods as thin wrappers
abstract contract SlidingFeeConnector is ISlidingFeePlugin, BaseConnector {
  using Plugins for uint8;

  uint8 internal constant SLIDING_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable slidingFeeImplementation;

  constructor(address _slidingFeeImplementation) {
    slidingFeeImplementation = _slidingFeeImplementation;
  }

  /// @notice Initialize SlidingFee plugin via delegatecall
  function _initializeSlidingFee(uint16 baseFee) internal returns (uint8) {
    _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.initializeSlidingFee, (baseFee))
    );
    return SLIDING_FEE_PLUGIN_CONFIG;
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
    _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.setPriceChangeFactor, (newPriceChangeFactor))
    );
  }

  /// @notice Set base fee via delegatecall
  function _setBaseFee(uint16 newBaseFee) internal {
    _delegateCall(slidingFeeImplementation, abi.encodeCall(ISlidingFeePluginImplementation.setBaseFee, (newBaseFee)));
  }

  /// @notice Get price change factor via delegatecall
  function _getPriceChangeFactor() internal returns (uint16) {
    bytes memory returnData = _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.getPriceChangeFactor, ())
    );
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get base fee via delegatecall
  function _getBaseFee() internal returns (uint16) {
    bytes memory returnData = _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.getBaseFee, ())
    );
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get fee factors via delegatecall
  function _getFeeFactors() internal returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    bytes memory returnData = _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.getFeeFactors, ())
    );
    return abi.decode(returnData, (uint128, uint128));
  }

  // ###### Public Interface (ISlidingFeePlugin) ######

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
