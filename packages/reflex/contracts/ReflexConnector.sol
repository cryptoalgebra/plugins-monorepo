// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IReflexPluginImplementation.sol';
import './interfaces/IReflexPlugin.sol';
import './libraries/ReflexStorage.sol';

/// @title Reflex Connector
/// @notice This contract provides delegatecall interface to Reflex plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract ReflexConnector is BaseConnector, IReflexPlugin {
  using Plugins for uint8;

  string internal constant REFLEX_MODULE_NAME = 'Reflex Plugin';
  uint8 internal constant REFLEX_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable reflexImplementation;

  constructor(address _reflexImplementation) {
    reflexImplementation = _reflexImplementation;
  }

  /// @notice Initialize Reflex plugin via delegatecall
  function _initializeReflex(address _router, bytes32 _configId) internal {
    _delegateCall(reflexImplementation, abi.encodeCall(IReflexPluginImplementation.initializeReflex, (_router, _configId)));
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
      abi.encodeCall(IReflexPluginImplementation.reflexAfterSwap, (triggerPoolId, amount0Delta, amount1Delta, zeroForOne, recipient))
    );
    return abi.decode(returnData, (uint256, address));
  }

  // ###### Public Interface ######

  /// @notice Updates the Reflex router address
  /// @param _router New router address to set
  function setReflexRouter(address _router) external override {
    _authorize();
    _delegateCall(reflexImplementation, abi.encodeCall(IReflexPluginImplementation.setReflexRouter, (_router)));
  }

  /// @notice Returns the current router address
  /// @return The address of the current Reflex router contract
  function getRouter() public view override returns (address) {
    return ReflexStorage.layout().reflexRouter;
  }

  /// @notice Get the current configuration ID for profit distribution
  /// @return The current configuration ID
  function getConfigId() public view override returns (bytes32) {
    return ReflexStorage.layout().reflexConfigId;
  }

  /// @notice Updates the configuration ID for profit distribution
  /// @param _configId New configuration ID to set
  function setReflexConfigId(bytes32 _configId) external override {
    _authorize();
    _delegateCall(reflexImplementation, abi.encodeCall(IReflexPluginImplementation.setReflexConfigId, (_configId)));
  }
}
