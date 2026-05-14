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
  event MinGasLeftSet(uint256 oldMinGasLeft, uint256 newMinGasLeft);
  event CallGasBudgetSet(uint256 oldCallGasBudget, uint256 newCallGasBudget);

  function initializeMevx(address mevxRouter, address mevxExecutor, address profitDistributor, bytes32 configId) external;
  function initializePool(address pool, uint160 sqrtPriceX96) external;

  function setConfigId(bytes32 configId) external;
  function setProfitDistributor(address profitDistributor) external;
  function setMevxExecutor(address mevxExecutor) external;
  function setMevxRouter(address mevxRouter) external;
  function setMinGasLeft(uint256 minGasLeft) external;
  function setCallGasBudget(uint256 callGasBudget) external;

  function mevxAfterSwap(address pool, address sender, address recipient, bool zeroToOne, int256 amount0, int256 amount1) external;
  function runArbitrage(
    bytes32 poolId,
    bool zeroToOne,
    int256 amount0,
    int256 amount1,
    address sender,
    address recipient
  ) external;
}
