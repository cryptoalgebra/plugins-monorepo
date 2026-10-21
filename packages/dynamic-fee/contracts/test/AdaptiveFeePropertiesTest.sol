// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

import { AlgebraFeeConfiguration } from '../types/AlgebraFeeConfiguration.sol';
import { AdaptiveFee, AlgebraFeeConfigurationU144Lib } from '../libraries/AdaptiveFee.sol';
import { AlgebraFeeConfigurationU144 } from '../types/AlgebraFeeConfigurationU144.sol';

/// @dev Separate from AdaptiveFeeTest, where every added selector shifts gas snapshots
contract AdaptiveFeePropertiesTest {
  using AlgebraFeeConfigurationU144Lib for AlgebraFeeConfiguration;

  AlgebraFeeConfiguration public feeConfig;

  constructor() {
    feeConfig = AdaptiveFee.initialFeeConfiguration();
  }

  /// @dev Validates like DynamicFeePluginImplementation does on a config change
  function setFeeConfig(AlgebraFeeConfiguration calldata config) external {
    AdaptiveFee.validateFeeConfiguration(config);
    feeConfig = config;
  }

  function getFee(uint88 volatility) external view returns (uint256 fee) {
    return AdaptiveFee.getFee(volatility, feeConfig.pack());
  }

  /// @dev Pure twin of getFee, so properties sweep configs without a transaction per draw
  function feeFor(AlgebraFeeConfiguration calldata config, uint88 volatility) external pure returns (uint256 fee) {
    return AdaptiveFee.getFee(volatility, AlgebraFeeConfigurationU144Lib.pack(config));
  }

  /// @dev Exposed to check that a sigmoid never exceeds its alpha on any input
  function sigmoid(uint256 x, uint16 g, uint16 alpha, uint256 beta) external pure returns (uint256) {
    return AdaptiveFee.sigmoid(x, g, alpha, beta);
  }
}
