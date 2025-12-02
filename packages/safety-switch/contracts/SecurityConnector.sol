// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ISecurityPlugin.sol';
import './interfaces/ISecurityPluginImplementation.sol';

/// @title Security Connector
/// @notice This contract provides delegatecall interface to Security plugin implementation
/// @dev Inherits from BaseConnector for common delegatecall utilities
abstract contract SecurityConnector is BaseConnector, ISecurityPlugin {
  using Plugins for uint8;

  uint8 internal constant SECURITY_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG);

  /// @dev Storage namespace for Security plugin using ERC-7201
  bytes32 internal constant SECURITY_NAMESPACE = keccak256('algebra.storage.security');

  struct SecurityLayout {
    address securityRegistry;
  }

  /// @dev Fetch pointer of Security plugin's storage for direct view access
  function _getSecurityLayout() internal pure returns (SecurityLayout storage layout) {
    bytes32 position = SECURITY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable securityImplementation;

  constructor(address _securityImplementation) {
    securityImplementation = _securityImplementation;
  }

  /// @notice Initialize Security plugin via delegatecall
  function _initializeSecurity(address _securityRegistry) internal returns (uint8) {
    _delegateCall(
      securityImplementation,
      abi.encodeCall(ISecurityPluginImplementation.initializeSecurity, (_securityRegistry))
    );
    return SECURITY_PLUGIN_CONFIG;
  }

  /// @notice Check status via delegatecall
  function _checkStatus(address poolAddress) internal {
    _delegateCall(securityImplementation, abi.encodeCall(ISecurityPluginImplementation.checkStatus, (poolAddress)));
  }

  /// @notice Check status on burn via delegatecall
  function _checkStatusOnBurn(address poolAddress) internal {
    _delegateCall(
      securityImplementation,
      abi.encodeCall(ISecurityPluginImplementation.checkStatusOnBurn, (poolAddress))
    );
  }

  // ###### Public Interface (ISecurityPlugin) ######

  /// @inheritdoc ISecurityPlugin
  function setSecurityRegistry(address registry) external override {
    _authorize();
    _delegateCall(
      securityImplementation,
      abi.encodeCall(ISecurityPluginImplementation.setSecurityRegistry, (registry))
    );
    emit SecurityRegistry(registry);
  }

  /// @inheritdoc ISecurityPlugin
  function getSecurityRegistry() external view override returns (address) {
    return _getSecurityLayout().securityRegistry;
  }
}
