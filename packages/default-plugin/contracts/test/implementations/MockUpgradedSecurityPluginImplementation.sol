// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPluginImplementation.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityPluginImplementation.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/libraries/SecurityStorage.sol';

import './libraries/MockV2Storage.sol';
import './mixins/V1Forwarder.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded Security Plugin Implementation
/// @notice Decorates the shipped module, V1 calls are forwarded instead of reimplemented
/// @dev Implements both module interfaces explicitly, so a change in either breaks this mock at compile time
contract MockUpgradedSecurityPluginImplementation is ISecurityPluginImplementation, IMockV2Security, V1Forwarder {
  constructor() V1Forwarder(address(new SecurityPluginImplementation())) {}

  function initializeSecurity(address) external {
    _forwardToV1();
  }

  function setSecurityRegistry(address) external {
    _forwardToV1();
  }

  /// @dev View functions cannot delegatecall, so this one reads the shared namespace directly
  function getSecurityRegistry() external view returns (address) {
    return SecurityStorage.layout().securityRegistry;
  }

  function checkStatus(address) external {
    _trackCheck();
    _forwardToV1();
  }

  function checkStatusOnBurn(address) external {
    _trackCheck();
    _forwardToV1();
  }

  // V2 additions

  function setEmergencyMode(bool enabled) external {
    MockV2Storage.security().emergencyMode = enabled;
  }

  function getEmergencyMode() external view returns (bool) {
    return MockV2Storage.security().emergencyMode;
  }

  function getCheckStats() external view returns (uint256 checkCount, uint256 lastCheckTimestamp) {
    MockV2Storage.SecurityLayout storage s = MockV2Storage.security();
    return (s.checkCount, s.lastCheckTimestamp);
  }

  function isUpgradedSecurityImpl() external pure returns (bool) {
    return true;
  }

  /// @dev V2: counts every status check and blocks the pool while emergency mode is on
  function _trackCheck() private {
    MockV2Storage.SecurityLayout storage s = MockV2Storage.security();
    s.checkCount++;
    s.lastCheckTimestamp = block.timestamp;

    if (s.emergencyMode) revert ISecurityPlugin.PoolDisabled();
  }
}
