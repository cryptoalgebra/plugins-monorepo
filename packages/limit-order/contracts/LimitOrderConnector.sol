// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title LimitOrder Connector
/// @notice This contract provides delegatecall functions to LimitOrder implementation
/// @dev Reduces main contract size by delegating logic to separate implementation
abstract contract LimitOrderConnector {
  using Plugins for uint8;

  /// @dev Storage namespace for LimitOrder plugin using ERC-7201
  bytes32 internal constant LIMIT_ORDER_NAMESPACE = keccak256('algebra.storage.limitorder');

  uint8 internal constant LIMIT_ORDER_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  struct LimitOrderLayout {
    address implementation;
    address limitOrderManager;
  }

  /// @dev Fetch pointer of LimitOrder plugin's storage
  function _getLimitOrderLayout() internal pure returns (LimitOrderLayout storage layout) {
    bytes32 position = LIMIT_ORDER_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Get LimitOrder implementation address
  function _getLimitOrderImplementation() internal view returns (address) {
    return _getLimitOrderLayout().implementation;
  }

  /// @notice Set LimitOrder implementation address
  function _setLimitOrderImplementation(address newImplementation) internal {
    _getLimitOrderLayout().implementation = newImplementation;
  }

  /// @notice Get the limitOrderManager address
  function _getLimitOrderManager() internal view returns (address) {
    return _getLimitOrderLayout().limitOrderManager;
  }

  /// @notice Set the limitOrderManager address via delegatecall
  function _setLimitOrderManager(address manager) internal {
    address impl = _getLimitOrderImplementation();
    require(impl != address(0), 'LimitOrder: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('setLimitOrderManager(address)', manager);
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'LimitOrder: setLimitOrderManager failed');
  }

  /// @notice Initialize LimitOrder plugin with manager address via delegatecall
  function _initializeLimitOrder(address limitOrderManager) internal returns (uint8) {
    address impl = _getLimitOrderImplementation();
    require(impl != address(0), 'LimitOrder: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('initializeLimitOrder(address)', limitOrderManager);
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'LimitOrder: initialization failed');
    
    return LIMIT_ORDER_PLUGIN_CONFIG;
  }

  /// @notice Update limit order manager state after swap via delegatecall
  function _updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) internal {
    address impl = _getLimitOrderImplementation();
    require(impl != address(0), 'LimitOrder: implementation not set');
    
    bytes memory data = abi.encodeWithSignature(
      'updateLimitOrderManagerState(address,bool,int24)',
      pool,
      zeroToOne,
      tick
    );
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'LimitOrder: updateLimitOrderManagerState failed');
  }
}
