// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

/// @title Minimal pool stand-in for RebalanceManager
/// @dev The shared MockPool has no factory()
/// @dev RebalanceManager reads only factory, tickSpacing and plugin
contract MockAlmPool {
  address public factory;
  int24 public tickSpacing;
  address public plugin;

  constructor(address _factory, int24 _tickSpacing) {
    factory = _factory;
    tickSpacing = _tickSpacing;
  }

  function setPlugin(address _plugin) external {
    plugin = _plugin;
  }
}
