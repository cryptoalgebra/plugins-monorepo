// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IAccessListPlugin.sol';
import './interfaces/IAccessListPluginImplementation.sol';
import './libraries/AccessListStorage.sol';

/// @title Access List Connector
/// @notice Delegatecall interface to Access List plugin implementation
/// @dev Uses tx.origin for user identification
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
abstract contract AccessListConnector is BaseConnector, IAccessListPlugin {
  using Plugins for uint8;

  string internal constant ACCESS_LIST_MODULE_NAME = 'Access List Plugin';
  uint8 internal constant ACCESS_LIST_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG | Plugins.AFTER_INIT_FLAG);

  address internal immutable accessListImplementation;

  constructor(address _accessListImplementation) {
    accessListImplementation = _accessListImplementation;
  }

  function _initializeAccessList(address _accessListRegistry) internal {
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.initializeAccessList, (_accessListRegistry)));
  }

  function _accessListVerifySwap(address pool) internal {
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.verifySwap, (pool)));
  }

  function _accessListVerifyAddLiquidity(address pool) internal {
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.verifyAddLiquidity, (pool)));
  }

  function _accessListVerifyFlash(address pool) internal {
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.verifyFlash, (pool)));
  }

  function _accessListVerifyInitialize(address pool) internal {
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.verifyInitialize, (pool)));
  }


  /// @inheritdoc IAccessListPlugin
  function setAccessListRegistry(address registry) external override {
    _authorize();
    _delegateCall(accessListImplementation, abi.encodeCall(IAccessListPluginImplementation.setAccessListRegistry, (registry)));
    emit AccessListRegistryUpdated(registry);
  }

  /// @inheritdoc IAccessListPlugin
  function getAccessListRegistry() external view override returns (address) {
    return AccessListStorage.layout().accessListRegistry;
  }
}
