// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title SlidingFee Connector
/// @notice This contract provides delegatecall interface to SlidingFee plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract SlidingFeeConnector {
  using Plugins for uint8;

  uint8 internal constant SLIDING_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable slidingFeeImplementation;

  constructor(address _slidingFeeImplementation) {
    slidingFeeImplementation = _slidingFeeImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateSlidingFeeRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('SlidingFee: delegatecall failed');
  }

  /// @notice Initialize SlidingFee plugin via delegatecall
  function _initializeSlidingFee(uint16 baseFee) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeSlidingFee(uint16)', baseFee);
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.delegatecall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
    
    return SLIDING_FEE_PLUGIN_CONFIG;
  }

  /// @notice Get fee and update factors via delegatecall
  function _getFeeAndUpdateFactors(bool zeroToOne, int24 currentTick, int24 lastTick) internal returns (uint16) {
    bytes memory data = abi.encodeWithSignature(
      'getFeeAndUpdateFactors(bool,int24,int24)',
      zeroToOne,
      currentTick,
      lastTick
    );
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.delegatecall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
    
    return abi.decode(returnData, (uint16));
  }

  /// @notice Set price change factor via delegatecall
  function _setPriceChangeFactor(uint16 newPriceChangeFactor) internal {
    bytes memory data = abi.encodeWithSignature('setPriceChangeFactor(uint16)', newPriceChangeFactor);
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.delegatecall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
  }

  /// @notice Set base fee via delegatecall
  function _setBaseFee(uint16 newBaseFee) internal {
    bytes memory data = abi.encodeWithSignature('setBaseFee(uint16)', newBaseFee);
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.delegatecall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
  }

  /// @notice Get price change factor via staticcall
  function _getPriceChangeFactor() internal view returns (uint16) {
    bytes memory data = abi.encodeWithSignature('getPriceChangeFactor()');
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.staticcall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
    
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get base fee via staticcall
  function _getBaseFee() internal view returns (uint16) {
    bytes memory data = abi.encodeWithSignature('getBaseFee()');
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.staticcall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
    
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get fee factors via staticcall
  function _getFeeFactors() internal view returns (uint128 zeroToOneFeeFactor, uint128 oneToZeroFeeFactor) {
    bytes memory data = abi.encodeWithSignature('getFeeFactors()');
    
    (bool success, bytes memory returnData) = slidingFeeImplementation.staticcall(data);
    if (!success) _propagateSlidingFeeRevert(returnData);
    
    return abi.decode(returnData, (uint128, uint128));
  }
}
