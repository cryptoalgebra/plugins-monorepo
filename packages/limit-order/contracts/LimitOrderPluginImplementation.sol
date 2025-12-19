// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ILimitOrderManager.sol';
import './libraries/LimitOrderStorage.sol';
import './interfaces/ILimitOrderPluginImplementation.sol';

/// @title LimitOrder Plugin Implementation
/// @notice This contract contains the logic for LimitOrder plugin that works with namespaced storage
/// @dev Called via delegatecall from LimitOrderConnector to reduce main contract size
contract LimitOrderPluginImplementation is ILimitOrderPluginImplementation {

  /// @notice Initialize LimitOrder plugin with manager address
  /// @dev Called via delegatecall from connector
  function initializeLimitOrder(address limitOrderManager) external {
    LimitOrderStorage.layout().limitOrderManager = limitOrderManager;
  }

  /// @notice Set the limitOrderManager address
  /// @dev Called via delegatecall from connector
  function setLimitOrderManager(address manager) external {
    LimitOrderStorage.layout().limitOrderManager = manager;
  }

  /// @notice Get the limitOrderManager address
  /// @dev Called via staticcall from connector
  function getLimitOrderManager() external view returns (address) {
    return LimitOrderStorage.layout().limitOrderManager;
  }

  /// @notice Update limit order manager state after swap
  /// @dev Called via delegatecall from connector
  function updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) external {
    address manager = LimitOrderStorage.layout().limitOrderManager;

    if (manager != address(0)) {
      ILimitOrderManager(manager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
