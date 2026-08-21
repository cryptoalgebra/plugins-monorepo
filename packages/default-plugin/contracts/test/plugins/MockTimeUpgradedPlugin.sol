// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';
import './mixins/UpgradeTestFunctions.sol';
import '../../types/ModuleImplementations.sol';

/// @title Mock Time Upgraded Plugin for testing upgrades with time manipulation
/// @notice Extends MockTimeAlgebraUpgradeablePlugin to keep advanceTime() after upgrade
contract MockTimeUpgradedPlugin is MockTimeAlgebraUpgradeablePlugin, UpgradeTestFunctions {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockTimeAlgebraUpgradeablePlugin(_factory, _pluginFactory, impls) {}

  function _upgradeTestAuthorize() internal view override {
    _authorize();
  }
}
