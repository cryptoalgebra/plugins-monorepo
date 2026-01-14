// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMevxPluginFactory
/// @notice Interface for plugin factories that support MEVX integration
interface IMevxPluginFactory {
  event DefaultMevxRouter(address newMevxRouter);
  event DefaultMevxExecutor(address newMevxExecutor);
  event DefaultProfitDistributor(address newProfitDistributor);
  event DefaultConfigId(bytes32 newConfigId);

  function defaultMevxRouter() external view returns (address);
  function defaultMevxExecutor() external view returns (address);
  function defaultProfitDistributor() external view returns (address);
  function defaultConfigId() external view returns (bytes32);

  function setMevxRouter(address newMevxRouter) external;
  function setMevxExecutor(address newMevxExecutor) external;
  function setProfitDistributor(address newProfitDistributor) external;
  function setConfigId(bytes32 newConfigId) external;
}
