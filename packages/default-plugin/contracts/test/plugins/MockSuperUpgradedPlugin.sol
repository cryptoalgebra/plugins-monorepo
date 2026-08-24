// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './mixins/MockV2UpgradedPluginBase.sol';
import '../types/ModuleImplementations.sol';

/// @title Mock Super Upgraded Plugin - ALL Modules V2
/// @notice Plugin with ALL upgraded implementations for comprehensive testing
/// @dev Tests that all modules can be upgraded simultaneously without conflicts
contract MockSuperUpgradedPlugin is MockV2UpgradedPluginBase {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockV2UpgradedPluginBase(_factory, _pluginFactory, impls) {}
}
