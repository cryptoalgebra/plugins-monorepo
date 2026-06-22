// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IPriceConvergencePluginImplementation
/// @notice Interface for type-safe delegatecall encoding in PriceConvergenceConnector.
interface IPriceConvergencePluginImplementation {
  function initializePriceConvergence(address _vault, address _rebalanceManager, int24 _positionWidth) external;

  function setVault(address _vault) external;

  function setRebalanceManager(address _rebalanceManager) external;

  function setPositionWidth(int24 _positionWidth) external;

  function rebalance(int256 swapQuantity, uint160 limitSqrtPrice, address algebraFactory) external;
}
