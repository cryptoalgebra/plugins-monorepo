// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ISlidingFeePlugin.sol';
import './interfaces/ISlidingFeePluginImplementation.sol';
import './libraries/SlidingFeeStorage.sol';

/// @title SlidingFee Connector
/// @notice This contract provides delegatecall interface to SlidingFee plugin implementation
abstract contract SlidingFeeConnector is ISlidingFeePlugin, BaseConnector {
  using Plugins for uint8;

  string internal constant SLIDING_FEE_MODULE_NAME = 'Sliding Fee Plugin';
  uint8 internal constant SLIDING_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  uint64 internal constant FEE_FACTOR_SHIFT = 96;
  
  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable slidingFeeImplementation;

  constructor(address _slidingFeeImplementation) {
    slidingFeeImplementation = _slidingFeeImplementation;
  }

  /// @notice Initialize SlidingFee plugin via delegatecall
  function _initializeSlidingFee(uint16 _baseFee) internal returns (uint8 pluginConfig, string memory moduleName) {
    _delegateCall(
      slidingFeeImplementation,
      abi.encodeCall(ISlidingFeePluginImplementation.initializeSlidingFee, (_baseFee))
    );
    return (SLIDING_FEE_PLUGIN_CONFIG, SLIDING_FEE_MODULE_NAME);
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

  // ###### View Methods (Direct Storage Access) ######

  /// @notice Get current fee for direction
  function _getCurrentFee(bool zeroToOne) internal view returns (uint16) {
    SlidingFeeStorage.Layout storage layout = SlidingFeeStorage.layout();
    uint256 adjustedFee = zeroToOne
      ? (uint256(layout.baseFee) * layout.feeFactors.zeroToOneFeeFactor) >> FEE_FACTOR_SHIFT
      : (uint256(layout.baseFee) * layout.feeFactors.oneToZeroFeeFactor) >> FEE_FACTOR_SHIFT;

    if (adjustedFee > type(uint16).max) {
      adjustedFee = type(uint16).max;
    } else if (adjustedFee == 0) {
      adjustedFee = 1;
    }
    return uint16(adjustedFee);
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
