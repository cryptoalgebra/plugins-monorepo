// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock of Algebra plugin factory for plugins testing
/// @dev Shared test contract - import from @cryptoalgebra/test-utils
contract MockPluginFactory {
  address public lastCreatedPlugin;
  address public defaultPluginImplementation;

  event PluginCreated(address indexed pool, address plugin);

  function setDefaultImplementation(address implementation) external {
    defaultPluginImplementation = implementation;
  }

  function beforeCreatePoolHook(
    address pool,
    address,
    address,
    address,
    address,
    bytes calldata
  ) external returns (address plugin) {
    // In real scenario, this would create a new plugin proxy
    // For testing, we just return the default implementation
    plugin = defaultPluginImplementation;
    lastCreatedPlugin = plugin;
    emit PluginCreated(pool, plugin);
  }

  function afterCreatePoolHook(address, address, address) external {}
}
