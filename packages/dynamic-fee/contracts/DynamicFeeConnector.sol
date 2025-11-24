// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import './types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144 } from './types/AlgebraFeeConfigurationU144.sol';

/// @title DynamicFee Connector
/// @notice This contract provides delegatecall functions to DynamicFee implementation
/// @dev Reduces main contract size by delegating logic to separate implementation
abstract contract DynamicFeeConnector {
  using Plugins for uint8;

  /// @dev Storage namespace for DynamicFee plugin using ERC-7201
  bytes32 internal constant DYNAMIC_FEE_NAMESPACE = keccak256('algebra.storage.dynamicfee');

  uint8 internal constant DYNAMIC_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  struct DynamicFeeLayout {
    address implementation;
    AlgebraFeeConfigurationU144 feeConfig;
  }

  /// @dev Fetch pointer of DynamicFee plugin's storage
  function _getDynamicFeeLayout() internal pure returns (DynamicFeeLayout storage layout) {
    bytes32 position = DYNAMIC_FEE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Get DynamicFee implementation address
  function _getDynamicFeeImplementation() internal view returns (address) {
    return _getDynamicFeeLayout().implementation;
  }

  /// @notice Set DynamicFee implementation address
  function _setDynamicFeeImplementation(address newImplementation) internal {
    _getDynamicFeeLayout().implementation = newImplementation;
  }

  /// @notice Initialize DynamicFee plugin with configuration via delegatecall
  function _initializeDynamicFee(AlgebraFeeConfiguration memory config) internal returns (uint8) {
    address impl = _getDynamicFeeImplementation();
    require(impl != address(0), 'DynamicFee: implementation not set');
    
    bytes memory data = abi.encodeWithSignature(
      'initializeDynamicFee((uint16,uint16,uint32,uint32,uint16,uint16,uint16))',
      config
    );
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'DynamicFee: initialization failed');
    
    return DYNAMIC_FEE_PLUGIN_CONFIG;
  }

  /// @notice Get current fee based on volatility via delegatecall
  function _getCurrentFee(uint88 volatilityAverage) internal returns (uint16 fee) {
    address impl = _getDynamicFeeImplementation();
    require(impl != address(0), 'DynamicFee: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('getCurrentFee(uint88)', volatilityAverage);
    
    (bool success, bytes memory returnData) = impl.delegatecall(data);
    require(success, 'DynamicFee: getCurrentFee failed');
    
    fee = abi.decode(returnData, (uint16));
  }

  /// @notice Change fee configuration via delegatecall
  function _changeFeeConfiguration(AlgebraFeeConfiguration calldata config) internal {
    address impl = _getDynamicFeeImplementation();
    require(impl != address(0), 'DynamicFee: implementation not set');
    
    bytes memory data = abi.encodeWithSignature(
      'changeFeeConfiguration((uint16,uint16,uint32,uint32,uint16,uint16,uint16))',
      config
    );
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'DynamicFee: changeFeeConfiguration failed');
  }

  /// @notice Get fee configuration via delegatecall
  function _getFeeConfig() internal returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee) {
    address impl = _getDynamicFeeImplementation();
    require(impl != address(0), 'DynamicFee: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('feeConfig()');
    
    (bool success, bytes memory returnData) = impl.delegatecall(data);
    require(success, 'DynamicFee: feeConfig failed');
    
    (alpha1, alpha2, beta1, beta2, gamma1, gamma2, baseFee) = abi.decode(
      returnData, 
      (uint16, uint16, uint32, uint32, uint16, uint16, uint16)
    );
  }
}
