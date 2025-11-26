// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title Security Connector
/// @notice This contract provides delegatecall interface to Security plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract SecurityConnector {
  using Plugins for uint8;

  uint8 internal constant SECURITY_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable securityImplementation;

  constructor(address _securityImplementation) {
    securityImplementation = _securityImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateSecurityRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('Security: delegatecall failed');
  }

  /// @notice Initialize Security plugin via delegatecall
  function _initializeSecurity(address _securityRegistry) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeSecurity(address)', _securityRegistry);
    
    (bool success, bytes memory returnData) = securityImplementation.delegatecall(data);
    if (!success) _propagateSecurityRevert(returnData);
    
    return SECURITY_PLUGIN_CONFIG;
  }

  /// @notice Set security registry via delegatecall
  function _setSecurityRegistry(address _securityRegistry) internal {
    bytes memory data = abi.encodeWithSignature('setSecurityRegistry(address)', _securityRegistry);
    
    (bool success, bytes memory returnData) = securityImplementation.delegatecall(data);
    if (!success) _propagateSecurityRevert(returnData);
  }

  /// @notice Get security registry via staticcall
  function _getSecurityRegistry() internal view returns (address) {
    bytes memory data = abi.encodeWithSignature('getSecurityRegistry()');
    
    (bool success, bytes memory returnData) = securityImplementation.staticcall(data);
    if (!success) _propagateSecurityRevert(returnData);
    
    return abi.decode(returnData, (address));
  }

  /// @notice Check status via delegatecall
  function _checkStatus(address poolAddress) internal {
    bytes memory data = abi.encodeWithSignature('checkStatus(address)', poolAddress);
    
    (bool success, bytes memory returnData) = securityImplementation.delegatecall(data);
    if (!success) _propagateSecurityRevert(returnData);
  }

  /// @notice Check status on burn via delegatecall
  function _checkStatusOnBurn(address poolAddress) internal {
    bytes memory data = abi.encodeWithSignature('checkStatusOnBurn(address)', poolAddress);
    
    (bool success, bytes memory returnData) = securityImplementation.delegatecall(data);
    if (!success) _propagateSecurityRevert(returnData);
  }
}
