// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import './interfaces/IFarmingPluginFactory.sol';
import './interfaces/IAlgebraVirtualPool.sol';
import './libraries/FarmingProxyStorage.sol';

/// @title FarmingProxy Plugin Implementation
/// @notice This contract contains ALL logic for FarmingProxy plugin that works with namespaced storage
/// @dev Called via delegatecall from FarmingProxyConnector to reduce main contract size
contract FarmingProxyPluginImplementation {
  using Plugins for uint8;

  /// @notice Set incentive address - COMPLETE LOGIC HERE
  /// @dev Called via delegatecall from connector
  /// @param newIncentive The new incentive address
  /// @param pluginFactory The plugin factory address
  /// @param pool The pool address
  function setIncentive(address newIncentive, address pluginFactory, address pool) external {
    FarmingProxyStorage.Layout storage layout = FarmingProxyStorage.layout();

    bool toConnect = newIncentive != address(0);
    bool accessAllowed;

    if (toConnect) {
      accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    } else {
      if (layout.lastIncentiveOwner != address(0)) accessAllowed = msg.sender == layout.lastIncentiveOwner;
      if (!accessAllowed) accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    }
    require(accessAllowed, 'Not allowed to set incentive');

    address currentPlugin = IAlgebraPool(pool).plugin();
    bool isPluginConnected = currentPlugin == address(this);

    if (toConnect) require(isPluginConnected, 'Plugin not attached');

    address currentIncentive = layout.incentive;
    require(currentIncentive != newIncentive, 'Already active');
    if (toConnect) require(currentIncentive == address(0), 'Has active incentive');

    layout.incentive = newIncentive;

    if (toConnect) {
      layout.lastIncentiveOwner = msg.sender;
    } else {
      layout.lastIncentiveOwner = address(0);
    }

    // Enable plugin flags if connected
    if (isPluginConnected) {
      (, , , uint8 currentPluginConfig, , ) = IAlgebraPool(pool).globalState();
      uint8 newPluginConfig = currentPluginConfig | uint8(Plugins.AFTER_SWAP_FLAG);
      if (currentPluginConfig != newPluginConfig) {
        IAlgebraPool(pool).setPluginConfig(newPluginConfig);
      }
    }
  }

  /// @notice Check if incentive is connected - COMPLETE LOGIC HERE
  /// @dev Called via delegatecall from connector
  /// @param targetIncentive The incentive address to check
  /// @param pool The pool address
  function isIncentiveConnected(address targetIncentive, address pool) external view returns (bool) {
    FarmingProxyStorage.Layout storage layout = FarmingProxyStorage.layout();

    if (layout.incentive != targetIncentive) return false;

    address currentPlugin = IAlgebraPool(pool).plugin();
    if (currentPlugin != address(this)) return false;

    (, , , uint8 pluginConfig, , ) = IAlgebraPool(pool).globalState();
    if (!pluginConfig.hasFlag(Plugins.AFTER_SWAP_FLAG)) return false;

    return true;
  }

  /// @notice Update virtual pool tick
  /// @dev Called via delegatecall from connector
  function updateVirtualPoolTick(bool zeroToOne, int24 tick) external {
    address _incentive = FarmingProxyStorage.layout().incentive;

    if (_incentive != address(0)) {
      IAlgebraVirtualPool(_incentive).crossTo(tick, zeroToOne);
    }
  }
}
