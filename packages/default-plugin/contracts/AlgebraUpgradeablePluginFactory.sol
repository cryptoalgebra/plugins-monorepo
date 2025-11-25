// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './AlgebraPluginBeacon.sol';
import './AlgebraPluginProxy.sol';
import './AlgebraUpgradeablePlugin.sol';

/// @title Algebra Upgradeable Plugin Factory (Simplified)
/// @notice Factory for deploying upgradeable plugins using Beacon Proxy pattern
/// @dev Simplified version with only FarmingProxy plugin for testing
contract AlgebraUpgradeablePluginFactory {
  address public immutable algebraFactory;
  address public immutable beacon;
  
  event PluginCreated(address indexed pool, address plugin);

  constructor(address _algebraFactory, address pluginImplementation) {
    algebraFactory = _algebraFactory;
    beacon = address(new AlgebraPluginBeacon(_algebraFactory, pluginImplementation));
  }

  /// @notice Deploy a new plugin proxy for a pool
  function createPlugin(
    address pool,
    address factory
  ) external returns (address plugin) {
    // For BeaconProxy, initialization happens in constructor of implementation
    plugin = address(new AlgebraPluginProxy(beacon, ''));
    
    emit PluginCreated(pool, plugin);
  }

  /// @notice Upgrade all plugins to new implementation
  function upgradePlugins(address newImplementation) external {
    AlgebraPluginBeacon(beacon).upgradeTo(newImplementation);
  }

  /// @notice Get current implementation address
  function implementation() external view returns (address) {
    return AlgebraPluginBeacon(beacon).implementation();
  }
}
