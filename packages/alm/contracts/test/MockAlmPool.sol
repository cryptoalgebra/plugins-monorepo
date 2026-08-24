// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @title Minimal pool stand-in for RebalanceManager
/// @dev The shared test-utils MockPool implements the actions and state interfaces but not the
/// immutables, so it has no factory(). RebalanceManager reads factory, tickSpacing and plugin off the
/// pool, and nothing else, so this exposes exactly those three.
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
