// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ILimitOrderManager.sol';
import './libraries/LimitOrderStorage.sol';
import './interfaces/ILimitOrderPluginImplementation.sol';

/// @title LimitOrder Plugin Implementation
/// @notice This contract contains the logic for LimitOrder plugin that works with namespaced storage
/// @dev Called via delegatecall from LimitOrderConnector to reduce main contract size
contract LimitOrderPluginImplementation is ILimitOrderPluginImplementation {
  /// @notice Initializes limit order manager
  /// @param limitOrderManager Manager address
  function initializeLimitOrder(address limitOrderManager) external {
    LimitOrderStorage.layout().limitOrderManager = limitOrderManager;
  }

  /// @notice Sets limit order manager
  /// @param manager New manager address
  function setLimitOrderManager(address manager) external {
    LimitOrderStorage.layout().limitOrderManager = manager;
  }

  /// @notice Returns limit order manager
  /// @return Manager address
  function getLimitOrderManager() external view returns (address) {
    return LimitOrderStorage.layout().limitOrderManager;
  }

  /// @notice Notifies manager after swap (if configured)
  /// @param pool Pool address
  /// @param zeroToOne Swap direction
  /// @param tick Current pool tick
  function updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) external {
    address manager = LimitOrderStorage.layout().limitOrderManager;

    if (manager != address(0)) {
      ILimitOrderManager(manager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
