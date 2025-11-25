// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import './types/AlgebraFeeConfiguration.sol';
import './interfaces/IDynamicFeeManager.sol';

/// @title DynamicFee Connector
/// @notice This contract provides delegatecall interface to DynamicFee plugin implementation
/// @dev Inherits from IDynamicFeeManager and provides all public methods as thin wrappers
abstract contract DynamicFeeConnector is IDynamicFeeManager {
  using Plugins for uint8;

  uint8 internal constant DYNAMIC_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable dynamicFeeImplementation;

  constructor(address _dynamicFeeImplementation) {
    dynamicFeeImplementation = _dynamicFeeImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateDynamicFeeRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('DynamicFee: delegatecall failed');
  }

  /// @notice Initialize DynamicFee plugin with configuration via delegatecall
  function _initializeDynamicFee(AlgebraFeeConfiguration memory config) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature(
      'initializeDynamicFee((uint16,uint16,uint32,uint32,uint16,uint16,uint16))',
      config
    );
    
    (bool success, bytes memory returnData) = dynamicFeeImplementation.delegatecall(data);
    if (!success) _propagateDynamicFeeRevert(returnData);
    
    return DYNAMIC_FEE_PLUGIN_CONFIG;
  }

  /// @notice Get current fee based on volatility via delegatecall
  function _getCurrentFee(uint88 volatilityAverage) internal returns (uint16 fee) {
    bytes memory data = abi.encodeWithSignature('getCurrentFee(uint88)', volatilityAverage);
    
    (bool success, bytes memory returnData) = dynamicFeeImplementation.delegatecall(data);
    if (!success) _propagateDynamicFeeRevert(returnData);
    
    return abi.decode(returnData, (uint16));
  }

  /// @notice Change fee configuration via delegatecall
  function _changeFeeConfiguration(AlgebraFeeConfiguration calldata config) internal {
    bytes memory data = abi.encodeWithSignature(
      'changeFeeConfiguration((uint16,uint16,uint32,uint32,uint16,uint16,uint16))',
      config
    );
    
    (bool success, bytes memory returnData) = dynamicFeeImplementation.delegatecall(data);
    if (!success) _propagateDynamicFeeRevert(returnData);
  }

  /// @notice Get fee configuration via staticcall
  function _getFeeConfig() internal view returns (
    uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, 
    uint16 gamma1, uint16 gamma2, uint16 baseFee
  ) {
    bytes memory data = abi.encodeWithSignature('getFeeConfig()');
    
    (bool success, bytes memory returnData) = dynamicFeeImplementation.staticcall(data);
    if (!success) _propagateDynamicFeeRevert(returnData);
    
    return abi.decode(returnData, (uint16, uint16, uint32, uint32, uint16, uint16, uint16));
  }

  // ###### Public Interface (IDynamicFeeManager) ######

  /// @inheritdoc IDynamicFeeManager
  function feeConfig()
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    return _getFeeConfig();
  }

  /// @inheritdoc IDynamicFeeManager
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external override {
    _authorize();
    _changeFeeConfiguration(config);
    emit FeeConfiguration(config);
  }

  // ###### Internal helpers to be implemented by inheriting contract ######

  /// @dev Must be implemented by inheriting contract to check authorization
  function _authorize() internal view virtual;
}
