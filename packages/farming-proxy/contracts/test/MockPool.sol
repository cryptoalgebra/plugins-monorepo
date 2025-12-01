// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Pool for FarmingProxy testing
contract MockPool {
  address public plugin;
  uint8 public pluginConfig;

  function setPlugin(address _plugin) external {
    plugin = _plugin;
  }

  function setPluginConfig(uint8 _config) external {
    pluginConfig = _config;
  }

  function globalState()
    external
    view
    returns (uint160 price, int24 tick, uint16 lastFee, uint8 _pluginConfig, uint16 communityFee, bool unlocked)
  {
    return (0, 0, 0, pluginConfig, 0, true);
  }
}
