// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../../AlgebraUpgradeablePlugin.sol';
import './mixins/UpgradeTestFunctions.sol';
import '../types/ModuleImplementations.sol';

/// @title Mock Upgraded Plugin for testing upgrades
/// @notice This contract simulates an upgraded version of AlgebraUpgradeablePlugin
/// @dev Adds a new variable and function to verify upgrade works correctly
contract MockUpgradedPlugin is AlgebraUpgradeablePlugin, UpgradeTestFunctions {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) AlgebraUpgradeablePlugin(_factory, _pluginFactory, impls.volatilityOracle, impls.dynamicFee, impls.farmingProxy, impls.alm, impls.security) {}

  function _upgradeTestAuthorize() internal view override {
    _authorize();
  }
}
