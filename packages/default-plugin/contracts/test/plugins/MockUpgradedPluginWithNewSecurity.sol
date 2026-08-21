// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './mixins/MockV2UpgradedPluginBase.sol';
import '../../types/ModuleImplementations.sol';

/// @title Mock Upgraded Plugin with New Security Implementation
/// @notice Plugin version that uses upgraded SecurityPluginImplementation
/// @dev The security implementation address is set via constructor (immutable)
contract MockUpgradedPluginWithNewSecurity is MockV2UpgradedPluginBase {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockV2UpgradedPluginBase(_factory, _pluginFactory, impls) {}
}
