// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../BaseAbstractPlugin.sol';
import '../AbstractCustomPluginFactory.sol';

/// @dev The smallest concrete plugin on the non-upgradeable base, which no package in this repository builds on
contract BaseAbstractPluginTest is BaseAbstractPlugin {
  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    string[] memory modules
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) {
    for (uint256 i; i < modules.length; ++i) {
      activeModules.push(modules[i]);
    }
  }

  function updatePluginConfigInPool(uint8 newPluginConfig) external {
    _updatePluginConfigInPool(newPluginConfig);
  }
}

/// @dev A custom plugin factory that hands out one fixed plugin, enough to reach the entry point guards
contract CustomPluginFactoryTest is AbstractCustomPluginFactory {
  address public immutable plugin;

  constructor(address _entryPoint, address _plugin) AbstractCustomPluginFactory(_entryPoint) {
    plugin = _plugin;
  }

  function _createPlugin(address) internal view override returns (address) {
    return plugin;
  }

  function setTickSpacing(address, int24) external override {}

  function setPlugin(address, address) external override {}

  function setPluginConfig(address, uint8) external override {}

  function setFee(address, uint16) external override {}
}
