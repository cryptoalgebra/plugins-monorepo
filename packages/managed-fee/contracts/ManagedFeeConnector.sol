// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IManagedSwapFeePlugin.sol';
import './interfaces/IManagedFeePluginImplementation.sol';
import './libraries/ManagedFeeStorage.sol';
import './libraries/ManagedFeeVerifier.sol';

/// @title ManagedFee Connector
/// @notice ManagedFee module provides delegatecall functions to ManagedFee implementation
abstract contract ManagedFeeConnector is IManagedSwapFeePlugin, BaseConnector {
  using Plugins for uint16;

  string internal constant MANAGED_FEE_MODULE_NAME = 'Managed Fee Plugin';
  uint16 internal constant MANAGED_FEE_PLUGIN_CONFIG = uint16(Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable managedFeeImplementation;

  constructor(address _managedFeeImplementation) {
    managedFeeImplementation = _managedFeeImplementation;
  }

  /// @notice Set whitelist status via delegatecall
  function _setWhitelistStatus(address _address, bool status) internal {
    _delegateCall(managedFeeImplementation, abi.encodeCall(IManagedFeePluginImplementation.setWhitelistStatus, (_address, status)));
  }

  /// @notice Get managed fee from plugin data via delegatecall
  function _getManagedFee(bytes memory pluginData) internal returns (uint24) {
    bytes memory returnData = _delegateCall(
      managedFeeImplementation,
      abi.encodeCall(IManagedFeePluginImplementation.getManagedFee, (pluginData))
    );
    return abi.decode(returnData, (uint24));
  }

  /// @notice The fee _getManagedFee would return, without spending the nonce
  /// @dev For getSwapFee. Reverts where the swap would
  function _quoteManagedFee(bytes memory pluginData) internal view returns (uint24 fee) {
    (fee, ) = ManagedFeeVerifier.verify(ManagedFeeStorage.layout(), pluginData);
  }

  // ###### Public Interface (IManagedSwapFeePlugin) ######

  /// @inheritdoc IManagedSwapFeePlugin
  function whitelistedAddresses(address _address) external view override returns (bool) {
    return ManagedFeeStorage.layout().whitelistedAddresses[_address];
  }

  /// @inheritdoc IManagedSwapFeePlugin
  function setWhitelistStatus(address _address, bool status) external override {
    _authorize();
    _setWhitelistStatus(_address, status);
    emit WhitelistedAddress(_address, status);
  }
}
