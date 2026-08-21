// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePluginImplementation.sol';

import './libraries/MockV2Storage.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded VolatilityOracle Plugin Implementation
/// @notice V1 surface is inherited so it can never drift from the shipped module
/// @dev V2 state lives in its own namespace, the module layout is never restated here
contract MockUpgradedVolatilityOraclePluginImplementation is
  VolatilityOraclePluginImplementation,
  IMockV2VolatilityOracle
{
  function setEnhancedMode(bool enabled) external {
    MockV2Storage.volatility().enhancedMode = enabled;
  }

  function getEnhancedMode() external view returns (bool) {
    return MockV2Storage.volatility().enhancedMode;
  }

  function isUpgradedVolatilityImpl() external pure returns (bool) {
    return true;
  }
}
