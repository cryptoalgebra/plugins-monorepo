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

  /// @dev Storage namespace for SlidingFee plugin using ERC-7201
  bytes32 internal constant SLIDING_FEE_NAMESPACE = keccak256('algebra.storage.slidingfee');

  uint64 internal constant FEE_FACTOR_SHIFT = 96;

  struct FeeFactors {
    uint128 zeroToOneFeeFactor;
    uint128 oneToZeroFeeFactor;
  }

  struct SlidingFeeLayout {
    FeeFactors feeFactors;
    uint16 priceChangeFactor;
    uint16 baseFee;
  }

  /// @dev Fetch pointer of SlidingFee plugin's storage for direct view access
  function _getSlidingFeeLayout() internal pure returns (SlidingFeeLayout storage layout) {
    bytes32 position = SLIDING_FEE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

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

  // ###### View Methods (Direct Storage Access) ######

  /// @notice Get price change factor
  function _getPriceChangeFactor() internal view returns (uint16) {
    return _getSlidingFeeLayout().priceChangeFactor;
  }

  /// @notice Get base fee
  function _getBaseFee() internal view returns (uint16) {
    return _getSlidingFeeLayout().baseFee;
  }

  /// @notice Get fee factors
  function _getFeeFactors() internal view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    FeeFactors memory factors = _getSlidingFeeLayout().feeFactors;
    return (factors.zeroToOneFeeFactor, factors.oneToZeroFeeFactor);
  }

  /// @notice Get current fee for direction
  function _getCurrentFee(bool zeroToOne) internal view returns (uint16) {
    SlidingFeeLayout storage layout = _getSlidingFeeLayout();
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
