// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IMevxPluginFactory
/// @notice Interface for plugin factories that support MEV-X integration
interface IMevxPluginFactory {
  event DefaultMevxRouter(address newMevxRouter);
  event DefaultMevxExecutor(address newMevxExecutor);
  event DefaultProfitDistributor(address newProfitDistributor);
  event DefaultMevxConfigId(bytes32 newConfigId);
  event DefaultMevProtectionFeeEnabled(bool enabled);

  function defaultMevxRouter() external view returns (address);

  function defaultMevxExecutor() external view returns (address);

  function defaultProfitDistributor() external view returns (address);

  function defaultMevxConfigId() external view returns (bytes32);

  function defaultMevProtectionFeeEnabled() external view returns (bool);

  function setMevxRouter(address newMevxRouter) external;

  function setMevxExecutor(address newMevxExecutor) external;

  function setProfitDistributor(address newProfitDistributor) external;

  function setMevxConfigId(bytes32 newConfigId) external;

  function setDefaultMevProtectionFeeEnabled(bool enabled) external;
}
