// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IReflexPluginImplementation.sol';

/// @title Reflex Connector
/// @notice This contract provides delegatecall interface to Reflex plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract ReflexConnector is BaseConnector {
  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable reflexImplementation;

  // ========== Events ==========

  /// @notice Emitted when the Reflex router address is updated
  /// @param oldRouter The address of the previous router contract
  /// @param newRouter The address of the new router contract
  event ReflexRouterUpdated(address oldRouter, address newRouter);

  /// @notice Emitted when the Reflex configuration ID is updated
  /// @param oldConfigId The previous configuration ID
  /// @param newConfigId The new configuration ID
  event ReflexConfigIdUpdated(bytes32 oldConfigId, bytes32 newConfigId);

  constructor(address _reflexImplementation) {
    reflexImplementation = _reflexImplementation;
  }

  /// @notice Initialize Reflex plugin via delegatecall
  function _initializeReflex(address _router, bytes32 _configId) internal {
    _delegateCall(
      reflexImplementation,
      abi.encodeCall(IReflexPluginImplementation.initializeReflex, (_router, _configId))
    );
  }

  /// @notice Set reflex router via delegatecall
  function _setReflexRouter(address _router) internal {
    _delegateCall(reflexImplementation, abi.encodeCall(IReflexPluginImplementation.setReflexRouter, (_router)));
  }

  /// @notice Set reflex config ID via delegatecall
  function _setReflexConfigId(bytes32 _configId) internal {
    _delegateCall(reflexImplementation, abi.encodeCall(IReflexPluginImplementation.setReflexConfigId, (_configId)));
  }

  /// @notice Get reflex router via delegatecall
  function _getReflexRouter() internal returns (address) {
    bytes memory returnData = _delegateCall(
      reflexImplementation,
      abi.encodeCall(IReflexPluginImplementation.getReflexRouter, ())
    );
    return abi.decode(returnData, (address));
  }

  /// @notice Get reflex config ID via delegatecall
  function _getReflexConfigId() internal returns (bytes32) {
    bytes memory returnData = _delegateCall(
      reflexImplementation,
      abi.encodeCall(IReflexPluginImplementation.getReflexConfigId, ())
    );
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
    bytes memory returnData = _delegateCall(
      reflexImplementation,
      abi.encodeCall(
        IReflexPluginImplementation.reflexAfterSwap,
        (triggerPoolId, amount0Delta, amount1Delta, zeroForOne, recipient)
      )
    );
    return abi.decode(returnData, (uint256, address));
  }

  // ###### Public Interface ######

  /// @notice Updates the Reflex router address
  /// @param _router New router address to set
  function setReflexRouter(address _router) external {
    _authorize();
    address oldRouter = _getReflexRouter();
    _setReflexRouter(_router);
    emit ReflexRouterUpdated(oldRouter, _router);
  }

  /// @notice Returns the current router address
  /// @return The address of the current Reflex router contract
  function getRouter() public returns (address) {
    return _getReflexRouter();
  }

  /// @notice Get the current configuration ID for profit distribution
  /// @return The current configuration ID
  function getConfigId() external returns (bytes32) {
    return _getReflexConfigId();
  }

  /// @notice Updates the configuration ID for profit distribution
  /// @param _configId New configuration ID to set
  function setReflexConfigId(bytes32 _configId) external {
    _authorize();
    bytes32 oldConfigId = _getReflexConfigId();
    _setReflexConfigId(_configId);
    emit ReflexConfigIdUpdated(oldConfigId, _configId);
  }
}
