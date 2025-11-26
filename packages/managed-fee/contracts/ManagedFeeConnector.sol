// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title ManagedFee Connector
/// @notice This contract provides delegatecall interface to ManagedFee plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract ManagedFeeConnector {
  using Plugins for uint8;

  uint8 internal constant MANAGED_FEE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable managedFeeImplementation;

  constructor(address _managedFeeImplementation) {
    managedFeeImplementation = _managedFeeImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateManagedFeeRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('ManagedFee: delegatecall failed');
  }

  /// @notice Initialize ManagedFee plugin via delegatecall
  function _initializeManagedFee() internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeManagedFee()');
    
    (bool success, bytes memory returnData) = managedFeeImplementation.delegatecall(data);
    if (!success) _propagateManagedFeeRevert(returnData);
    
    return MANAGED_FEE_PLUGIN_CONFIG;
  }

  /// @notice Set whitelist status via delegatecall
  function _setWhitelistStatus(address _address, bool status) internal {
    bytes memory data = abi.encodeWithSignature('setWhitelistStatus(address,bool)', _address, status);
    
    (bool success, bytes memory returnData) = managedFeeImplementation.delegatecall(data);
    if (!success) _propagateManagedFeeRevert(returnData);
  }

  /// @notice Check if address is whitelisted via staticcall
  function _isWhitelisted(address _address) internal view returns (bool) {
    bytes memory data = abi.encodeWithSignature('isWhitelisted(address)', _address);
    
    (bool success, bytes memory returnData) = managedFeeImplementation.staticcall(data);
    if (!success) _propagateManagedFeeRevert(returnData);
    
    return abi.decode(returnData, (bool));
  }

  /// @notice Get managed fee from plugin data via delegatecall
  function _getManagedFee(bytes memory pluginData) internal returns (uint24) {
    bytes memory data = abi.encodeWithSignature('getManagedFee(bytes)', pluginData);
    
    (bool success, bytes memory returnData) = managedFeeImplementation.delegatecall(data);
    if (!success) _propagateManagedFeeRevert(returnData);
    
    return abi.decode(returnData, (uint24));
  }
}
