// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ILimitOrderManager.sol';

/// @title LimitOrder Plugin Implementation
/// @notice This contract contains the logic for LimitOrder plugin that works with namespaced storage
/// @dev Called via delegatecall from LimitOrderConnector to reduce main contract size
contract LimitOrderPluginImplementation {
  /// @dev Storage namespace for LimitOrder plugin using ERC-7201
  bytes32 internal constant LIMIT_ORDER_NAMESPACE = keccak256('algebra.storage.limitorder');

  struct LimitOrderLayout {
    address limitOrderManager;
  }

  /// @dev Fetch pointer of LimitOrder plugin's storage
  function _getLimitOrderLayout() internal pure returns (LimitOrderLayout storage layout) {
    bytes32 position = LIMIT_ORDER_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize LimitOrder plugin with manager address
  /// @dev Called via delegatecall from connector
  function initializeLimitOrder(address limitOrderManager) external {
    LimitOrderLayout storage layout = _getLimitOrderLayout();
    layout.limitOrderManager = limitOrderManager;
  }

  /// @notice Set the limitOrderManager address
  /// @dev Called via delegatecall from connector
  function setLimitOrderManager(address manager) external {
    LimitOrderLayout storage layout = _getLimitOrderLayout();
    layout.limitOrderManager = manager;
  }

  /// @notice Get the limitOrderManager address
  /// @dev Called via staticcall from connector
  function getLimitOrderManager() external view returns (address) {
    LimitOrderLayout storage layout = _getLimitOrderLayout();
    return layout.limitOrderManager;
  }

  /// @notice Update limit order manager state after swap
  /// @dev Called via delegatecall from connector
  function updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) external {
    LimitOrderLayout storage layout = _getLimitOrderLayout();
    address manager = layout.limitOrderManager;
    
    if (manager != address(0)) {
      ILimitOrderManager(manager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
