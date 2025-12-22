// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144 } from './types/AlgebraFeeConfigurationU144.sol';
import './libraries/AdaptiveFee.sol';
import './libraries/DynamicFeeStorage.sol';
import './interfaces/IDynamicFeeManager.sol';
import './interfaces/IDynamicFeePluginImplementation.sol';

/// @title DynamicFee Connector
/// @notice This contract provides delegatecall interface to DynamicFee plugin implementation
/// @dev Inherits from BaseConnector for common delegatecall utilities
abstract contract DynamicFeeConnector is BaseConnector, IDynamicFeeManager {
  using Plugins for uint8;

  string internal constant DYNAMIC_FEE_MODULE_NAME = 'Dynamic Fee Plugin';
  uint8 internal constant DYNAMIC_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable dynamicFeeImplementation;

  constructor(address _dynamicFeeImplementation) {
    dynamicFeeImplementation = _dynamicFeeImplementation;
  }

  /// @notice Initialize DynamicFee plugin with configuration via delegatecall
  function _initializeDynamicFee(AlgebraFeeConfiguration memory config) internal {
    _delegateCall(dynamicFeeImplementation, abi.encodeCall(IDynamicFeePluginImplementation.initializeDynamicFee, (config)));
  }

  /// @notice Get current fee based on volatility
  function _getCurrentFee(uint88 volatilityAverage) internal view returns (uint16 fee) {
    AlgebraFeeConfigurationU144 feeConfig_ = DynamicFeeStorage.layout().feeConfig;

    if (feeConfig_.alpha1() | feeConfig_.alpha2() == 0) return feeConfig_.baseFee();
    return AdaptiveFee.getFee(volatilityAverage, feeConfig_);
  }

  // ###### Public Interface (IDynamicFeeManager) ######

  /// @inheritdoc IDynamicFeeManager
  function feeConfig()
    external
    view
    override
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    AlgebraFeeConfigurationU144 feeConfig_ = DynamicFeeStorage.layout().feeConfig;

    (alpha1, alpha2) = (feeConfig_.alpha1(), feeConfig_.alpha2());
    (beta1, beta2) = (feeConfig_.beta1(), feeConfig_.beta2());
    (gamma1, gamma2) = (feeConfig_.gamma1(), feeConfig_.gamma2());
    baseFee = feeConfig_.baseFee();
  }

  /// @inheritdoc IDynamicFeeManager
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external override {
    _authorize();
    _delegateCall(dynamicFeeImplementation, abi.encodeCall(IDynamicFeePluginImplementation.changeFeeConfiguration, (config)));
    emit FeeConfiguration(config);
  }
}
