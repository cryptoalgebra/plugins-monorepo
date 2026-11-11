// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/limit-order-plugin/contracts/LimitOrderPluginImplementation.sol';

import './libraries/MockV2Storage.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded LimitOrder Plugin Implementation
/// @notice V1 surface is inherited so it can never drift from the shipped module
/// @dev V2 state lives in its own namespace, the module layout is never restated here
contract MockUpgradedLimitOrderPluginImplementation is LimitOrderPluginImplementation, IMockV2LimitOrder {
  function setAdvancedMode(bool enabled) external {
    MockV2Storage.limitOrder().advancedMode = enabled;
  }

  function getAdvancedMode() external view returns (bool) {
    return MockV2Storage.limitOrder().advancedMode;
  }

  function isUpgradedLimitOrderImpl() external pure returns (bool) {
    return true;
  }
}
