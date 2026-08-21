// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/alm-plugin/contracts/AlmPluginImplementation.sol';

import './libraries/MockV2Storage.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded ALM Plugin Implementation
/// @notice V1 surface is inherited so it can never drift from the shipped module
/// @dev V2 state lives in its own namespace, the module layout is never restated here
contract MockUpgradedALMPluginImplementation is
  AlmPluginImplementation,
  IMockV2Alm
{
  function setAdvancedMode(bool enabled) external {
    MockV2Storage.alm().advancedMode = enabled;
  }

  function getAdvancedMode() external view returns (bool) {
    return MockV2Storage.alm().advancedMode;
  }

  function isUpgradedAlmImpl() external pure returns (bool) {
    return true;
  }
}
