// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePluginImplementation.sol';

import './libraries/MockV2Storage.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded DynamicFee Plugin Implementation
/// @notice V1 surface is inherited so it can never drift from the shipped module
/// @dev V2 state lives in its own namespace, the module layout is never restated here
contract MockUpgradedDynamicFeePluginImplementation is DynamicFeePluginImplementation, IMockV2DynamicFee {
  function setAdvancedMode(bool enabled) external {
    MockV2Storage.dynamicFee().advancedMode = enabled;
  }

  function getAdvancedMode() external view returns (bool) {
    return MockV2Storage.dynamicFee().advancedMode;
  }

  function isUpgradedDynamicFeeImpl() external pure returns (bool) {
    return true;
  }
}
