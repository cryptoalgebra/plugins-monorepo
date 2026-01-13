// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ISecurityPlugin.sol';
import './interfaces/ISecurityPluginImplementation.sol';
import './libraries/SecurityStorage.sol';

/// @title Security Connector
/// @notice This contract provides delegatecall interface to Security plugin implementation
abstract contract SecurityConnector is BaseConnector, ISecurityPlugin {
  using Plugins for uint8;

  string internal constant SECURITY_MODULE_NAME = 'Security Plugin';
  uint8 internal constant SECURITY_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable securityImplementation;

  constructor(address _securityImplementation) {
    securityImplementation = _securityImplementation;
  }

  /// @notice Initialize Security plugin via delegatecall
  function _initializeSecurity(address _securityRegistry) internal {
    _delegateCall(securityImplementation, abi.encodeCall(ISecurityPluginImplementation.initializeSecurity, (_securityRegistry)));
  }

  /// @notice Check status via delegatecall
  function _checkStatus(address poolAddress) internal {
    _delegateCall(securityImplementation, abi.encodeCall(ISecurityPluginImplementation.checkStatus, (poolAddress)));
  }

  /// @notice Check status on burn via delegatecall
  function _checkStatusOnBurn(address poolAddress) internal {
    _delegateCall(securityImplementation, abi.encodeCall(ISecurityPluginImplementation.checkStatusOnBurn, (poolAddress)));
  }

  // ###### Public Interface (ISecurityPlugin) ######

  /// @inheritdoc ISecurityPlugin
  function setSecurityRegistry(address registry) external override {
    _authorize();
    _delegateCall(securityImplementation, abi.encodeCall(ISecurityPluginImplementation.setSecurityRegistry, (registry)));
    emit SecurityRegistry(registry);
  }

  /// @inheritdoc ISecurityPlugin
  function getSecurityRegistry() external view override returns (address) {
    return SecurityStorage.layout().securityRegistry;
  }
}
