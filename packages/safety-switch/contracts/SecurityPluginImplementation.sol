// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ISecurityRegistry.sol';
import './interfaces/ISecurityPlugin.sol';
import './interfaces/ISecurityPluginImplementation.sol';
import './libraries/SecurityStorage.sol';

/// @title Security Plugin Implementation
/// @notice This contract contains ALL logic for Security plugin that works with namespaced storage
/// @dev Called via delegatecall from SecurityConnector to reduce main contract size
contract SecurityPluginImplementation is ISecurityPluginImplementation {
  /// @notice Initialize Security plugin
  /// @param _securityRegistry Address of security registry
  function initializeSecurity(address _securityRegistry) external {
    SecurityStorage.layout().securityRegistry = _securityRegistry;
  }

  /// @notice Set security registry
  /// @param _securityRegistry New security registry address
  function setSecurityRegistry(address _securityRegistry) external {
    SecurityStorage.layout().securityRegistry = _securityRegistry;
  }

  /// @notice Get security registry
  /// @return Security registry address
  function getSecurityRegistry() external view returns (address) {
    return SecurityStorage.layout().securityRegistry;
  }

  /// @notice Check pool status
  /// @param poolAddress Address of pool to check
  function checkStatus(address poolAddress) external {
    address securityRegistry = SecurityStorage.layout().securityRegistry;

    if (securityRegistry != address(0)) {
      ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(poolAddress);
      if (status != ISecurityRegistry.Status.ENABLED) {
        if (status == ISecurityRegistry.Status.DISABLED) {
          revert ISecurityPlugin.PoolDisabled();
        } else {
          revert ISecurityPlugin.BurnOnly();
        }
      }
    }
  }

  /// @notice Check pool status on burn
  /// @param poolAddress Address of pool to check
  function checkStatusOnBurn(address poolAddress) external {
    address securityRegistry = SecurityStorage.layout().securityRegistry;

    if (securityRegistry != address(0)) {
      ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(poolAddress);
      if (status == ISecurityRegistry.Status.DISABLED) {
        revert ISecurityPlugin.PoolDisabled();
      }
    }
  }
}
