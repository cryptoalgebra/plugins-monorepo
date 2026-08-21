// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './mixins/MockV2UpgradedPluginBase.sol';
import '../../types/ModuleImplementations.sol';

/// @title Mock Upgraded Plugin with New FarmingProxy Implementation
/// @notice Plugin version that uses upgraded FarmingProxyPluginImplementation
/// @dev The farming implementation address is set via constructor (immutable)
contract MockUpgradedPluginWithNewFarming is MockV2UpgradedPluginBase {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockV2UpgradedPluginBase(_factory, _pluginFactory, impls) {}
}
