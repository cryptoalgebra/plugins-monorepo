// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolImmutables.sol';
import './interfaces/IMsgSender.sol';
import './interfaces/IPermissionsAdapter.sol';
import './interfaces/IPermissionsAdapterFactory.sol';
import './interfaces/IPermissionedPoolPlugin.sol';
import './interfaces/IPermissionedPoolPluginImplementation.sol';
import './libraries/PermissionedPoolStorage.sol';

/// @title Permissioned Pool Plugin Implementation
/// @notice Contains all business logic for Permissioned Pool verification, executed via delegatecall
contract PermissionedPoolPluginImplementation is IPermissionedPoolPluginImplementation {
  /// @notice Initialize Permissioned Pool plugin
  function initializePermissionedPool(address _permissionsAdapterFactory) external {
    PermissionedPoolStorage.layout().permissionsAdapterFactory = _permissionsAdapterFactory;
  }

  /// @notice Set Permissions Adapter Factory
  function setPermissionsAdapterFactory(address _permissionsAdapterFactory) external {
    PermissionedPoolStorage.layout().permissionsAdapterFactory = _permissionsAdapterFactory;
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifyInitialize(address pool) external view {
    IPermissionsAdapterFactory factory = _factory();
    if (address(factory) == address(0)) return;

    address token0 = IAlgebraPoolImmutables(pool).token0();
    address token1 = IAlgebraPoolImmutables(pool).token1();

    // Both tokens must be checked unconditionally - `||` short-circuiting here would skip the
    // registered-but-unverified revert on token1 whenever token0 is already verified.
    bool token0Verified = _checkTokenAtInit(factory, token0);
    bool token1Verified = _checkTokenAtInit(factory, token1);
    if (!token0Verified && !token1Verified) revert IPermissionedPoolPlugin.NoVerifiedToken();
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifySwap(address pool, address sender) external view {
    _verifyTokenPair(pool, sender, true);
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifyFlash(address pool, address sender) external view {
    _verifyTokenPair(pool, sender, true);
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifyAddLiquidity(address pool, address sender) external view {
    _verifyTokenPair(pool, sender, false);
  }

  /// @dev A token without a registered adapter is unpermissioned and always passes.
  /// A token with a registered-but-unverified adapter blocks pool initialization entirely.
  function _checkTokenAtInit(IPermissionsAdapterFactory factory, address token) internal view returns (bool isVerifiedToken) {
    address adapter = factory.getAdapter(token);
    if (adapter == address(0)) return false;
    if (!factory.isVerified(token)) revert IPermissionedPoolPlugin.UnverifiedTokenAdapter(token);
    return true;
  }

  /// @dev Both tokens of the pair are checked independently, even if only one side is permissioned.
  function _verifyTokenPair(address pool, address sender, bool checkSwappingEnabled) internal view {
    IPermissionsAdapterFactory factory = _factory();
    if (address(factory) == address(0)) return;

    address token0 = IAlgebraPoolImmutables(pool).token0();
    address token1 = IAlgebraPoolImmutables(pool).token1();

    _verifyToken(factory, token0, sender, checkSwappingEnabled);
    _verifyToken(factory, token1, sender, checkSwappingEnabled);
  }

  function _verifyToken(IPermissionsAdapterFactory factory, address token, address sender, bool checkSwappingEnabled) internal view {
    address adapterAddress = factory.getAdapter(token);
    if (adapterAddress == address(0) || !factory.isVerified(token)) return;

    IPermissionsAdapter adapter = IPermissionsAdapter(adapterAddress);
    if (checkSwappingEnabled && !adapter.swappingEnabled()) revert IPermissionedPoolPlugin.SwappingDisabled(token);

    address realSender = _resolveRealSender(factory, sender);
    if (!adapter.isAllowed(realSender)) revert IPermissionedPoolPlugin.NotAllowed(token, realSender);
  }

  /// @dev `sender` is trusted as-is unless it is itself a governance-approved router - an
  /// unapproved contract cannot spoof a different identity because we never call its
  /// `msgSender()` in the first place.
  function _resolveRealSender(IPermissionsAdapterFactory factory, address sender) internal view returns (address) {
    if (!factory.allowedRouters(sender)) return sender;

    try IMsgSender(sender).msgSender() returns (address realSender) {
      return realSender;
    } catch {
      revert IPermissionedPoolPlugin.RouterMsgSenderCallFailed();
    }
  }

  function _factory() internal view returns (IPermissionsAdapterFactory) {
    return IPermissionsAdapterFactory(PermissionedPoolStorage.layout().permissionsAdapterFactory);
  }
}
