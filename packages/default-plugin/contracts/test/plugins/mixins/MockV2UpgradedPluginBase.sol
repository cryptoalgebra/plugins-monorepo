// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../MockTimeAlgebraUpgradeablePlugin.sol';
import './V2ModuleAccessors.sol';
import '../../types/ModuleImplementations.sol';

/// @title Base for plugin mocks that expose upgraded module functions
/// @notice Pulls in every V2 accessor mixin and wires them to the plugin once
/// @dev Which module actually runs V2 logic is decided by the implementation addresses passed to the constructor
abstract contract MockV2UpgradedPluginBase is
  MockTimeAlgebraUpgradeablePlugin,
  V2VolatilityAccessors,
  V2DynamicFeeAccessors,
  V2FarmingAccessors,
  V2AlmAccessors,
  V2SecurityAccessors
{
  constructor(
    address _factory,
    address _pluginFactory,
    ModuleImplementations memory impls
  ) MockTimeAlgebraUpgradeablePlugin(_factory, _pluginFactory, impls) {}

  function _v2Authorize() internal view override {
    _authorize();
  }

  function _v2Call(address implementation, bytes memory data) internal override returns (bytes memory) {
    return _delegateCall(implementation, data);
  }

  function _v2VolatilityImpl() internal view override returns (address) {
    return volatilityOracleImplementation;
  }

  function _v2DynamicFeeImpl() internal view override returns (address) {
    return dynamicFeeImplementation;
  }

  function _v2FarmingImpl() internal view override returns (address) {
    return farmingProxyImplementation;
  }

  function _v2AlmImpl() internal view override returns (address) {
    return almImplementation;
  }

  function _v2SecurityImpl() internal view override returns (address) {
    return securityImplementation;
  }
}
