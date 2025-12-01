// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title ISecurityPluginImplementation
/// @notice Interface for Security plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in SecurityConnector
interface ISecurityPluginImplementation {
  function initializeSecurity(address _securityRegistry) external;
  function setSecurityRegistry(address _securityRegistry) external;
  function getSecurityRegistry() external view returns (address);
  function checkStatus(address poolAddress) external;
  function checkStatusOnBurn(address poolAddress) external;
}
