// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMevxPluginImplementation
/// @notice Interface for MEVX plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in MevxConnector
interface IMevxPluginImplementation {

  event ConfigIdSet(bytes32 oldConfigId, bytes32 newConfigId);
  event ProfitDistributorSet(address oldProfitDistributor, address newProfitDistributor);
  event MevxExecutorSet(address oldMevxExecutor, address newMevxExecutor);
  event MevxRouterSet(address oldMevxRouter, address newMevxRouter);

  function initializeMevx(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external;
  function initializePool(address pool, uint160 sqrtPriceX96) external;

  function setConfigId(bytes32 configId) external;
  function setProfitDistributor(address profitDistributor) external;
  function setMevxExecutor(address mevxExecutor) external;
  function setMevxRouter(address mevxRouter) external;

  function mevxAfterSwap(address pool, bool zeroToOne, int256 amount0, int256 amount1, address recipient) external;
}
