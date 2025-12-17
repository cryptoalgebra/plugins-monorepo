// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './types/AlgebraFeeConfiguration.sol';
import { AlgebraFeeConfigurationU144, AlgebraFeeConfigurationU144Lib } from './types/AlgebraFeeConfigurationU144.sol';
import './libraries/AdaptiveFee.sol';
import './libraries/DynamicFeeStorage.sol';

/// @title DynamicFee Plugin Implementation
/// @notice This contract contains ALL logic for DynamicFee plugin that works with namespaced storage
/// @dev Called via delegatecall from DynamicFeeConnector to reduce main contract size
contract DynamicFeePluginImplementation {
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  /// @notice Initialize DynamicFee plugin with configuration
  /// @dev Called via delegatecall from connector
  function initializeDynamicFee(AlgebraFeeConfiguration memory config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    DynamicFeeStorage.layout().feeConfig = config.pack();
  }

  /// @notice Get current fee based on volatility
  /// @dev Called via delegatecall from connector
  function getCurrentFee(uint88 volatilityAverage) external view returns (uint16 fee) {
    AlgebraFeeConfigurationU144 feeConfig_ = DynamicFeeStorage.layout().feeConfig;

    if (feeConfig_.alpha1() | feeConfig_.alpha2() == 0) return feeConfig_.baseFee();
    return AdaptiveFee.getFee(volatilityAverage, feeConfig_);
  }

  /// @notice Change fee configuration
  /// @dev Called via delegatecall from connector
  function changeFeeConfiguration(AlgebraFeeConfiguration calldata config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    DynamicFeeStorage.layout().feeConfig = config.pack();
  }

  /// @notice Get fee configuration
  /// @dev Called via staticcall from connector
  function getFeeConfig()
    external
    view
    returns (uint16 alpha1, uint16 alpha2, uint32 beta1, uint32 beta2, uint16 gamma1, uint16 gamma2, uint16 baseFee)
  {
    AlgebraFeeConfigurationU144 feeConfig_ = DynamicFeeStorage.layout().feeConfig;

    (alpha1, alpha2) = (feeConfig_.alpha1(), feeConfig_.alpha2());
    (beta1, beta2) = (feeConfig_.beta1(), feeConfig_.beta2());
    (gamma1, gamma2) = (feeConfig_.gamma1(), feeConfig_.gamma2());
    baseFee = feeConfig_.baseFee();
  }
}
