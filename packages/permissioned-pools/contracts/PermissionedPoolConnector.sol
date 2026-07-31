// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IAllowlistChecker.sol';
import './interfaces/IAllowlistCheckerRegistry.sol';
import './interfaces/IPermissionedPoolPlugin.sol';
import './interfaces/IPermissionedPoolPluginImplementation.sol';
import './libraries/PermissionedPoolStorage.sol';
import './libraries/PermissionFlags.sol';

/// @title Permissioned Pool Connector
/// @notice Delegatecall interface to Permissioned Pool plugin implementation
/// @dev Replaces tx.origin-based gating with a two-level real-sender resolution
/// (allowedRouters + IMsgSender self-report). See PermissionedPoolPluginImplementation for the
/// actual verification logic and AllowlistCheckerRegistry for the checker/router registries.
abstract contract PermissionedPoolConnector is BaseConnector, IPermissionedPoolPlugin {
  using Plugins for uint8;

  string internal constant PERMISSIONED_POOL_MODULE_NAME = 'Permissioned Pool Plugin';
  uint8 internal constant PERMISSIONED_POOL_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG | Plugins.AFTER_INIT_FLAG);

  address internal immutable permissionedPoolImplementation;

  constructor(address _permissionedPoolImplementation) {
    permissionedPoolImplementation = _permissionedPoolImplementation;
  }

  function _initializePermissionedPool(address _allowlistCheckerRegistry) internal {
    _delegateCall(
      permissionedPoolImplementation,
      abi.encodeCall(IPermissionedPoolPluginImplementation.initializePermissionedPool, (_allowlistCheckerRegistry))
    );
  }

  function _permissionedPoolVerifyInitialize(address pool) internal {
    _delegateCall(permissionedPoolImplementation, abi.encodeCall(IPermissionedPoolPluginImplementation.verifyInitialize, (pool)));
  }

  function _permissionedPoolVerifySwap(address pool, address sender) internal {
    _delegateCall(permissionedPoolImplementation, abi.encodeCall(IPermissionedPoolPluginImplementation.verifySwap, (pool, sender)));
  }

  function _permissionedPoolVerifyAddLiquidity(address pool, address sender) internal {
    _delegateCall(permissionedPoolImplementation, abi.encodeCall(IPermissionedPoolPluginImplementation.verifyAddLiquidity, (pool, sender)));
  }

  function _permissionedPoolVerifyFlash(address pool, address sender) internal {
    _delegateCall(permissionedPoolImplementation, abi.encodeCall(IPermissionedPoolPluginImplementation.verifyFlash, (pool, sender)));
  }

  /// @inheritdoc IPermissionedPoolPlugin
  /// @dev Implemented directly in the connector (not via delegatecall) because a raw .delegatecall
  /// cannot be used inside a `view` function; the registry/checker calls below are regular external
  /// view calls, only the storage read of our own registry address needs to bypass delegatecall.
  function isTraderEligible(address account, address token) external view override returns (PermissionFlag) {
    address registryAddress = PermissionedPoolStorage.layout().allowlistCheckerRegistry;
    if (registryAddress == address(0)) return PermissionFlags.ALL_ALLOWED;

    address checkerAddress = IAllowlistCheckerRegistry(registryAddress).getChecker(token);
    if (checkerAddress == address(0)) return PermissionFlags.ALL_ALLOWED;

    return IAllowlistChecker(checkerAddress).checkAllowlist(account, token);
  }

  /// @inheritdoc IPermissionedPoolPlugin
  function setAllowlistCheckerRegistry(address registry) external override {
    _authorize();
    _delegateCall(
      permissionedPoolImplementation,
      abi.encodeCall(IPermissionedPoolPluginImplementation.setAllowlistCheckerRegistry, (registry))
    );
    emit AllowlistCheckerRegistryUpdated(registry);
  }

  /// @inheritdoc IPermissionedPoolPlugin
  function getAllowlistCheckerRegistry() external view override returns (address) {
    return PermissionedPoolStorage.layout().allowlistCheckerRegistry;
  }
}
