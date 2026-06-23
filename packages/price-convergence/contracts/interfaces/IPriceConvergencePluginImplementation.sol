// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IPriceConvergencePluginImplementation
/// @notice Interface for type-safe delegatecall encoding in PriceConvergenceConnector.
interface IPriceConvergencePluginImplementation {
  function setVault(address _vault) external;
}
