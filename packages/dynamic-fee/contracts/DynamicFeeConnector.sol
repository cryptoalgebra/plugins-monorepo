// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144, AlgebraFeeConfigurationU144Lib } from './types/AlgebraFeeConfigurationU144.sol';
import './libraries/AdaptiveFee.sol';
import './interfaces/IDynamicFeeManager.sol';
import './interfaces/IDynamicFeePluginImplementation.sol';

/// @title DynamicFee Connector
/// @notice This contract provides delegatecall interface to DynamicFee plugin implementation
/// @dev Inherits from BaseConnector for common delegatecall utilities
abstract contract DynamicFeeConnector is BaseConnector, IDynamicFeeManager {
  using Plugins for uint8;

  uint8 internal constant DYNAMIC_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Storage namespace for DynamicFee plugin using ERC-7201
  bytes32 internal constant DYNAMIC_FEE_NAMESPACE = keccak256('algebra.storage.dynamicfee');

  struct DynamicFeeLayout {
    AlgebraFeeConfigurationU144 feeConfig;
  }

  /// @dev Fetch pointer of DynamicFee plugin's storage for direct view access
  function _getDynamicFeeLayout() internal pure returns (DynamicFeeLayout storage layout) {
    bytes32 position = DYNAMIC_FEE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable dynamicFeeImplementation;

  constructor(address _dynamicFeeImplementation) {
    dynamicFeeImplementation = _dynamicFeeImplementation;
  }

  /// @notice Initialize DynamicFee plugin with configuration via delegatecall
  function _initializeDynamicFee(AlgebraFeeConfiguration memory config) internal returns (uint8) {
    _delegateCall(
      dynamicFeeImplementation,
      abi.encodeCall(IDynamicFeePluginImplementation.initializeDynamicFee, (config))
    );
    return DYNAMIC_FEE_PLUGIN_CONFIG;
  }

  /// @notice Get current fee based on volatility via delegatecall
  function _getCurrentFee(uint88 volatilityAverage) internal returns (uint16 fee) {
    bytes memory returnData = _delegateCall(
      dynamicFeeImplementation,
      abi.encodeCall(IDynamicFeePluginImplementation.getCurrentFee, (volatilityAverage))
    );
    return abi.decode(returnData, (uint16));
  }

  // ###### Public Interface (IDynamicFeeManager) ######

  /// @inheritdoc IDynamicFeeManager
  function feeConfig()
    external
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    bytes memory returnData = _delegateCall(
      dynamicFeeImplementation,
      abi.encodeCall(IDynamicFeePluginImplementation.getFeeConfig, ())
    );
    return abi.decode(returnData, (uint16, uint16, uint32, uint32, uint16, uint16, uint16));
  }

  /// @inheritdoc IDynamicFeeManager
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external override {
    _authorize();
    _delegateCall(
      dynamicFeeImplementation,
      abi.encodeCall(IDynamicFeePluginImplementation.changeFeeConfiguration, (config))
    );
    emit FeeConfiguration(config);
  }

  /// @notice Get current fee based on volatility (view version)
  function _getCurrentFeeView(uint88 volatilityAverage) internal view returns (uint16 fee) {
    DynamicFeeLayout storage layout = _getDynamicFeeLayout();
    AlgebraFeeConfigurationU144 feeConfig_ = layout.feeConfig;

    if (feeConfig_.alpha1() | feeConfig_.alpha2() == 0) return feeConfig_.baseFee();
    return AdaptiveFee.getFee(volatilityAverage, feeConfig_);
  }
}
