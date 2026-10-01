// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import { AlgebraFeeConfiguration } from '../types/AlgebraFeeConfiguration.sol';
import { AdaptiveFee, AlgebraFeeConfigurationU144Lib } from '../libraries/AdaptiveFee.sol';
import { AlgebraFeeConfigurationU144 } from '../types/AlgebraFeeConfigurationU144.sol';

/// @dev Deliberately separate from AdaptiveFeeTest.
/// That contract carries the gas snapshots, and every selector added to it shifts them.
contract AdaptiveFeePropertiesTest {
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  AlgebraFeeConfiguration public feeConfig;

  constructor() {
    feeConfig = AdaptiveFee.initialFeeConfiguration();
  }

  /// @dev Mirrors the validation DynamicFeePluginImplementation runs on a config change.
  /// A config production would reject is rejected here too.
  function setFeeConfig(AlgebraFeeConfiguration calldata config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    feeConfig = config;
  }

  function getFee(uint88 volatility) external view returns (uint256 fee) {
    return AdaptiveFee.getFee(volatility, feeConfig.pack());
  }

  /// @dev Pure twin of getFee, so a property can sweep configs without a transaction per draw.
  /// Validation stays the job of setFeeConfig.
  function feeFor(AlgebraFeeConfiguration calldata config, uint88 volatility) external pure returns (uint256 fee) {
    return AdaptiveFee.getFee(volatility, AlgebraFeeConfigurationU144Lib.pack(config));
  }

  /// @dev The library guarantees a sigmoid never exceeds its alpha.
  /// Exposed directly so that can be checked on arbitrary inputs, not only the two getFee composes.
  function sigmoid(uint256 x, uint16 g, uint16 alpha, uint256 beta) external pure returns (uint256) {
    return AdaptiveFee.sigmoid(x, g, alpha, beta);
  }
}
