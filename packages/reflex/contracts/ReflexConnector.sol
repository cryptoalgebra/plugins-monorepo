// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Reflex Connector
/// @notice This contract provides delegatecall interface to Reflex plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract ReflexConnector {
  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable reflexImplementation;

  constructor(address _reflexImplementation) {
    reflexImplementation = _reflexImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateReflexRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('Reflex: delegatecall failed');
  }

  /// @notice Initialize Reflex plugin via delegatecall
  function _initializeReflex(address _router, bytes32 _configId) internal {
    bytes memory data = abi.encodeWithSignature('initializeReflex(address,bytes32)', _router, _configId);
    
    (bool success, bytes memory returnData) = reflexImplementation.delegatecall(data);
    if (!success) _propagateReflexRevert(returnData);
  }

  /// @notice Set reflex router via delegatecall
  function _setReflexRouter(address _router) internal {
    bytes memory data = abi.encodeWithSignature('setReflexRouter(address)', _router);
    
    (bool success, bytes memory returnData) = reflexImplementation.delegatecall(data);
    if (!success) _propagateReflexRevert(returnData);
  }

  /// @notice Set reflex config ID via delegatecall
  function _setReflexConfigId(bytes32 _configId) internal {
    bytes memory data = abi.encodeWithSignature('setReflexConfigId(bytes32)', _configId);
    
    (bool success, bytes memory returnData) = reflexImplementation.delegatecall(data);
    if (!success) _propagateReflexRevert(returnData);
  }

  /// @notice Get reflex router via staticcall
  function _getReflexRouter() internal view returns (address) {
    bytes memory data = abi.encodeWithSignature('getReflexRouter()');
    
    (bool success, bytes memory returnData) = reflexImplementation.staticcall(data);
    if (!success) _propagateReflexRevert(returnData);
    
    return abi.decode(returnData, (address));
  }

  /// @notice Get reflex config ID via staticcall
  function _getReflexConfigId() internal view returns (bytes32) {
    bytes memory data = abi.encodeWithSignature('getReflexConfigId()');
    
    (bool success, bytes memory returnData) = reflexImplementation.staticcall(data);
    if (!success) _propagateReflexRevert(returnData);
    
    return abi.decode(returnData, (bytes32));
  }

  /// @notice Execute reflex after swap via delegatecall
  function _reflexAfterSwapDelegate(
    bytes32 triggerPoolId,
    int256 amount0Delta,
    int256 amount1Delta,
    bool zeroForOne,
    address recipient
  ) internal returns (uint256 profit, address profitToken) {
    bytes memory data = abi.encodeWithSignature(
      'reflexAfterSwap(bytes32,int256,int256,bool,address)',
      triggerPoolId,
      amount0Delta,
      amount1Delta,
      zeroForOne,
      recipient
    );
    
    (bool success, bytes memory returnData) = reflexImplementation.delegatecall(data);
    if (!success) _propagateReflexRevert(returnData);
    
    return abi.decode(returnData, (uint256, address));
  }
}
