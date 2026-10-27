// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import './interfaces/IManagedSwapFeePlugin.sol';
import './interfaces/IManagedFeePluginImplementation.sol';
import './libraries/ManagedFeeStorage.sol';
import './libraries/ManagedFeeVerifier.sol';

/// @title ManagedFee Plugin Implementation
/// @notice This contract contains ALL logic for ManagedFee plugin that works with namespaced storage
/// @dev Called via delegatecall from ManagedFeeConnector to reduce main contract size
contract ManagedFeePluginImplementation is IManagedFeePluginImplementation {
  /// @notice Set whitelist status for an address
  /// @param _address Address to set whitelist status for
  /// @param status True to whitelist, false to remove from whitelist
  function setWhitelistStatus(address _address, bool status) external {
    ManagedFeeStorage.layout().whitelistedAddresses[_address] = status;
  }

  /// @notice Check if address is whitelisted
  /// @param _address Address to check
  /// @return True if whitelisted
  function isWhitelisted(address _address) external view returns (bool) {
    return ManagedFeeStorage.layout().whitelistedAddresses[_address];
  }

  /// @notice Get managed fee from plugin data
  /// @param pluginData Encoded PluginData struct
  /// @return fee The fee to apply
  function getManagedFee(bytes memory pluginData) external returns (uint24 fee) {
    ManagedFeeStorage.Layout storage layout = ManagedFeeStorage.layout();
    bytes32 nonce;
    (fee, nonce) = ManagedFeeVerifier.verify(layout, pluginData);
    layout.usedNonces[nonce] = true;
  }
}
