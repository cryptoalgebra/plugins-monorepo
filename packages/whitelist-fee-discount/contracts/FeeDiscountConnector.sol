// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title FeeDiscount Connector
/// @notice This contract provides delegatecall interface to FeeDiscount plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract FeeDiscountConnector {
  using Plugins for uint8;

  uint8 internal constant FEE_DISCOUNT_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable feeDiscountImplementation;

  constructor(address _feeDiscountImplementation) {
    feeDiscountImplementation = _feeDiscountImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateFeeDiscountRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('FeeDiscount: delegatecall failed');
  }

  /// @notice Initialize FeeDiscount plugin via delegatecall
  function _initializeFeeDiscount(address _feeDiscountRegistry) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeFeeDiscount(address)', _feeDiscountRegistry);
    
    (bool success, bytes memory returnData) = feeDiscountImplementation.delegatecall(data);
    if (!success) _propagateFeeDiscountRevert(returnData);
    
    return FEE_DISCOUNT_PLUGIN_CONFIG;
  }

  /// @notice Set fee discount registry via delegatecall
  function _setFeeDiscountRegistry(address _feeDiscountRegistry) internal {
    bytes memory data = abi.encodeWithSignature('setFeeDiscountRegistry(address)', _feeDiscountRegistry);
    
    (bool success, bytes memory returnData) = feeDiscountImplementation.delegatecall(data);
    if (!success) _propagateFeeDiscountRevert(returnData);
  }

  /// @notice Get fee discount registry via staticcall
  function _getFeeDiscountRegistry() internal view returns (address) {
    bytes memory data = abi.encodeWithSignature('getFeeDiscountRegistry()');
    
    (bool success, bytes memory returnData) = feeDiscountImplementation.staticcall(data);
    if (!success) _propagateFeeDiscountRevert(returnData);
    
    return abi.decode(returnData, (address));
  }

  /// @notice Apply fee discount via delegatecall
  function _applyFeeDiscount(address user, address pool, uint24 fee) internal returns (uint24) {
    bytes memory data = abi.encodeWithSignature('applyFeeDiscount(address,address,uint24)', user, pool, fee);
    
    (bool success, bytes memory returnData) = feeDiscountImplementation.delegatecall(data);
    if (!success) _propagateFeeDiscountRevert(returnData);
    
    return abi.decode(returnData, (uint24));
  }
}
