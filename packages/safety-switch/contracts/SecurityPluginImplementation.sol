// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/ISecurityRegistry.sol';
import './interfaces/ISecurityPlugin.sol';

/// @title Security Plugin Implementation
/// @notice This contract contains ALL logic for Security plugin that works with namespaced storage
/// @dev Called via delegatecall from SecurityConnector to reduce main contract size
contract SecurityPluginImplementation {
  /// @dev Storage namespace for Security plugin using ERC-7201
  bytes32 internal constant SECURITY_NAMESPACE = keccak256('algebra.storage.security');

  struct SecurityLayout {
    address securityRegistry;
  }

  /// @dev Fetch pointer of Security plugin's storage
  function _getSecurityLayout() internal pure returns (SecurityLayout storage layout) {
    bytes32 position = SECURITY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize Security plugin
  /// @dev Called via delegatecall from connector
  /// @param _securityRegistry Address of security registry
  function initializeSecurity(address _securityRegistry) external {
    SecurityLayout storage layout = _getSecurityLayout();
    layout.securityRegistry = _securityRegistry;
  }

  /// @notice Set security registry
  /// @dev Called via delegatecall from connector
  /// @param _securityRegistry New security registry address
  function setSecurityRegistry(address _securityRegistry) external {
    SecurityLayout storage layout = _getSecurityLayout();
    layout.securityRegistry = _securityRegistry;
  }

  /// @notice Get security registry
  /// @dev Called via staticcall from connector
  /// @return Security registry address
  function getSecurityRegistry() external view returns (address) {
    SecurityLayout storage layout = _getSecurityLayout();
    return layout.securityRegistry;
  }

  /// @notice Check pool status
  /// @dev Called via delegatecall from connector
  /// @param poolAddress Address of pool to check
  function checkStatus(address poolAddress) external {
    SecurityLayout storage layout = _getSecurityLayout();
    address securityRegistry = layout.securityRegistry;

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
  /// @dev Called via delegatecall from connector
  /// @param poolAddress Address of pool to check
  function checkStatusOnBurn(address poolAddress) external {
    SecurityLayout storage layout = _getSecurityLayout();
    address securityRegistry = layout.securityRegistry;

    if (securityRegistry != address(0)) {
      ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(poolAddress);
      if (status == ISecurityRegistry.Status.DISABLED) {
        revert ISecurityPlugin.PoolDisabled();
      }
    }
  }
}
