// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Pool for testing
/// @notice Simplified mock of IAlgebraPool for unit tests
contract MockPool {
  address public plugin;
  uint8 public pluginConfig;

  // Mock global state
  uint160 public price = 79228162514264337593543950336; // sqrt(1) * 2^96
  int24 public tick = 0;
  uint16 public fee = 3000;
  uint8 public communityFee = 0;

  function setPlugin(address _plugin) external {
    plugin = _plugin;
  }

  function setPluginConfig(uint8 _config) external {
    pluginConfig = _config;
  }

  function globalState()
    external
    view
    returns (uint160 price_, int24 tick_, uint16 fee_, uint8 pluginConfig_, uint8 communityFee_, bool unlocked_)
  {
    return (price, tick, fee, pluginConfig, communityFee, true);
  }

  function setGlobalState(uint160 _price, int24 _tick, uint16 _fee, uint8 _communityFee) external {
    price = _price;
    tick = _tick;
    fee = _fee;
    communityFee = _communityFee;
  }
}
