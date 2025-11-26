// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title LimitOrder Connector
/// @notice This contract provides delegatecall functions to LimitOrder implementation
/// @dev Reduces main contract size by delegating logic to separate implementation
abstract contract LimitOrderConnector {
  using Plugins for uint8;

  uint8 internal constant LIMIT_ORDER_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable limitOrderImplementation;

  constructor(address _limitOrderImplementation) {
    limitOrderImplementation = _limitOrderImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateLimitOrderRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('LimitOrder: delegatecall failed');
  }

  /// @notice Get the limitOrderManager address via staticcall
  function _getLimitOrderManager() internal view returns (address) {
    bytes memory data = abi.encodeWithSignature('getLimitOrderManager()');
    
    (bool success, bytes memory returnData) = limitOrderImplementation.staticcall(data);
    if (!success) _propagateLimitOrderRevert(returnData);
    
    return abi.decode(returnData, (address));
  }

  /// @notice Set the limitOrderManager address via delegatecall
  function _setLimitOrderManager(address manager) internal {
    bytes memory data = abi.encodeWithSignature('setLimitOrderManager(address)', manager);
    
    (bool success, bytes memory returnData) = limitOrderImplementation.delegatecall(data);
    if (!success) _propagateLimitOrderRevert(returnData);
  }

  /// @notice Initialize LimitOrder plugin with manager address via delegatecall
  function _initializeLimitOrder(address limitOrderManager) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeLimitOrder(address)', limitOrderManager);
    
    (bool success, bytes memory returnData) = limitOrderImplementation.delegatecall(data);
    if (!success) _propagateLimitOrderRevert(returnData);
    
    return LIMIT_ORDER_PLUGIN_CONFIG;
  }

  /// @notice Update limit order manager state after swap via delegatecall
  function _updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) internal {
    bytes memory data = abi.encodeWithSignature(
      'updateLimitOrderManagerState(address,bool,int24)',
      pool,
      zeroToOne,
      tick
    );
    
    (bool success, bytes memory returnData) = limitOrderImplementation.delegatecall(data);
    if (!success) _propagateLimitOrderRevert(returnData);
  }
}
