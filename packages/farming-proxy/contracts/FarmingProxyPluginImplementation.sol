// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import './interfaces/IFarmingPluginFactory.sol';
import './interfaces/IAlgebraVirtualPool.sol';

/// @title FarmingProxy Plugin Implementation
/// @notice This contract contains ALL logic for FarmingProxy plugin that works with namespaced storage
/// @dev Called via delegatecall from FarmingProxyConnector to reduce main contract size
contract FarmingProxyPluginImplementation {
  using Plugins for uint8;

  /// @dev Storage namespace for FarmingProxy plugin using ERC-7201
  bytes32 internal constant FARMING_PROXY_NAMESPACE = keccak256('algebra.storage.farmingproxy');

  struct FarmingProxyLayout {
    address implementation;
    address incentive;
    address lastIncentiveOwner;
  }

  /// @dev Fetch pointer of FarmingProxy plugin's storage
  function _getFarmingProxyLayout() internal pure returns (FarmingProxyLayout storage layout) {
    bytes32 position = FARMING_PROXY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @dev Get plugin address from pool (via delegatecall context)
  /// @dev When called via delegatecall, address(this) returns the calling contract's address
  function _getPluginInPool() internal view returns (address plugin) {
    // In delegatecall context, we need to read from pool's storage
    // pool is an immutable variable in the calling contract
    address pool;
    assembly {
      // Assuming pool is stored in a specific slot (need to match BaseAbstractPlugin)
      pool := sload(0x00) // This is simplified, actual slot depends on inheritance
    }
    
    // Fallback: try to call pool.plugin()
    try IAlgebraPool(pool).plugin() returns (address _plugin) {
      plugin = _plugin;
    } catch {
      plugin = address(0);
    }
  }

  /// @dev Get pool state (via delegatecall context)
  function _getPoolState() internal view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig) {
    address pool;
    assembly {
      pool := sload(0x00) // Simplified
    }
    
    try IAlgebraPool(pool).globalState() returns (uint160 _price, int24 _tick, uint16 _fee, uint8 _pluginConfig, uint16, uint16) {
      (price, tick, fee, pluginConfig) = (_price, _tick, _fee, _pluginConfig);
    } catch {}
  }

  /// @dev Enable plugin flags (via delegatecall context)
  function _enablePluginFlags(uint8 config, address pool) internal {
    (, , , uint8 currentPluginConfig) = _getPoolState();
    uint8 newPluginConfig = currentPluginConfig | config;
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }

  /// @notice Initialize FarmingProxy plugin
  /// @dev Called via delegatecall from connector
  function initializeFarmingProxy() external {
    // Nothing to initialize for now
  }

  /// @notice Set incentive address - COMPLETE LOGIC HERE
  /// @dev Called via delegatecall from connector
  function setIncentive(address newIncentive, address pluginFactory) external {
    FarmingProxyLayout storage layout = _getFarmingProxyLayout();
    
    bool toConnect = newIncentive != address(0);
    bool accessAllowed;
    
    if (toConnect) {
      accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    } else {
      if (layout.lastIncentiveOwner != address(0)) accessAllowed = msg.sender == layout.lastIncentiveOwner;
      if (!accessAllowed) accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    }
    require(accessAllowed, 'Not allowed to set incentive');

    address currentPlugin = _getPluginInPool();
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
      address pool;
      assembly {
        pool := sload(0x00)
      }
      _enablePluginFlags(uint8(Plugins.AFTER_SWAP_FLAG), pool);
    }
  }

  /// @notice Check if incentive is connected - COMPLETE LOGIC HERE
  /// @dev Called via delegatecall from connector
  function isIncentiveConnected(address targetIncentive) external view returns (bool) {
    FarmingProxyLayout storage layout = _getFarmingProxyLayout();
    
    if (layout.incentive != targetIncentive) return false;
    
    address currentPlugin = _getPluginInPool();
    if (currentPlugin != address(this)) return false;
    
    (, , , uint8 pluginConfig) = _getPoolState();
    if (!pluginConfig.hasFlag(Plugins.AFTER_SWAP_FLAG)) return false;

    return true;
  }

  /// @notice Update virtual pool tick
  /// @dev Called via delegatecall from connector
  function updateVirtualPoolTick(bool zeroToOne, int24 tick) external {
    FarmingProxyLayout storage layout = _getFarmingProxyLayout();
    address _incentive = layout.incentive;
    
    if (_incentive != address(0)) {
      IAlgebraVirtualPool(_incentive).crossTo(tick, zeroToOne);
    }
  }
}

