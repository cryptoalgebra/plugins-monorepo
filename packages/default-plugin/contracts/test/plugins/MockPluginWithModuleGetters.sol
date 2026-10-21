// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

import './MockTimeAlgebraUpgradeablePlugin.sol';
import '../types/ModuleImplementations.sol';

/// @title Mock plugin that exposes its module implementation immutables
/// @notice Connectors keep them internal, so reordering ModuleImplementations compiles silently
/// @dev A separate contract, since an extra selector on the mock plugin shifts gas snapshots
contract MockPluginWithModuleGetters is MockTimeAlgebraUpgradeablePlugin {
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockTimeAlgebraUpgradeablePlugin(_factory, _pluginFactory, impls) {}

  function moduleImplementations() external view returns (ModuleImplementations memory) {
    return
      ModuleImplementations({
        volatilityOracle: volatilityOracleImplementation,
        dynamicFee: dynamicFeeImplementation,
        farmingProxy: farmingProxyImplementation,
        alm: almImplementation,
        security: securityImplementation
      });
  }
}
