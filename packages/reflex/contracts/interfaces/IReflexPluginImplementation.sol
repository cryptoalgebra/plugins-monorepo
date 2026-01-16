// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IReflexPluginImplementation
/// @notice Interface for Reflex plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in ReflexConnector
interface IReflexPluginImplementation {
  function initializeReflex(address _router, bytes32 _configId) external;
  function setReflexRouter(address _router) external;
  function setReflexConfigId(bytes32 _configId) external;
  function getReflexRouter() external view returns (address);
  function getReflexConfigId() external view returns (bytes32);
  function reflexAfterSwap(
    bytes32 triggerPoolId,
    int256 amount0Delta,
    int256 amount1Delta,
    bool zeroForOne,
    address recipient
  ) external returns (uint256 profit, address profitToken);

  event ReflexRouterUpdated(address oldRouter, address newRouter);
  event ReflexConfigIdUpdated(bytes32 oldConfigId, bytes32 newConfigId);
}
