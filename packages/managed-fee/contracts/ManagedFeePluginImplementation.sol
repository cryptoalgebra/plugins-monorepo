// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import './interfaces/IManagedSwapFeePlugin.sol';
import './interfaces/IManagedFeePluginImplementation.sol';
import './libraries/ManagedFeeStorage.sol';

/// @title ManagedFee Plugin Implementation
/// @notice This contract contains ALL logic for ManagedFee plugin that works with namespaced storage
/// @dev Called via delegatecall from ManagedFeeConnector to reduce main contract size
contract ManagedFeePluginImplementation is IManagedFeePluginImplementation {
  using ECDSA for bytes32;

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

    (bytes32 nonce, uint24 _fee, address user, uint32 expireTime, bytes memory signature) = _parsePluginData(pluginData);

    if (_fee >= 1000000) revert IManagedSwapFeePlugin.FeeExceedsLimit();
    if (layout.usedNonces[nonce]) revert IManagedSwapFeePlugin.InvalidNonce();
    if (expireTime < block.timestamp) revert IManagedSwapFeePlugin.Expired();
    if (user != tx.origin) revert IManagedSwapFeePlugin.NotAllowed();

    _verifySignature(layout, ECDSA.toEthSignedMessageHash(_getParamsHash(nonce, _fee, user, expireTime)), signature);
    layout.usedNonces[nonce] = true;

    return _fee;
  }

  function _parsePluginData(bytes memory pluginData) private pure returns (bytes32, uint24, address, uint32, bytes memory) {
    IManagedSwapFeePlugin.PluginData memory data = abi.decode(pluginData, (IManagedSwapFeePlugin.PluginData));
    return (data.nonce, data.fee, data.user, data.expire, data.signature);
  }

  function _verifySignature(ManagedFeeStorage.Layout storage layout, bytes32 hash, bytes memory signature) private view {
    address recoveredSigner = hash.recover(signature);
    if (!layout.whitelistedAddresses[recoveredSigner]) revert IManagedSwapFeePlugin.NotWhitelisted();
  }

  function _getParamsHash(bytes32 nonce, uint24 fee, address user, uint32 expire) private pure returns (bytes32) {
    return keccak256(abi.encode(nonce, fee, user, expire));
  }
}
