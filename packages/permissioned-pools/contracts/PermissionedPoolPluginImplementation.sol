// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolImmutables.sol';
import './interfaces/IMsgSender.sol';
import './interfaces/IAllowlistChecker.sol';
import './interfaces/IAllowlistCheckerRegistry.sol';
import './interfaces/IPermissionedPoolPlugin.sol';
import './interfaces/IPermissionedPoolPluginImplementation.sol';
import './libraries/PermissionedPoolStorage.sol';
import './libraries/PermissionFlags.sol';

/// @title Permissioned Pool Plugin Implementation
/// @notice Contains all business logic for Permissioned Pool verification, executed via delegatecall
/// @dev Never trusts tx.origin or the raw hook `sender` as the real user.
/// The real sender is only trusted from a router's own `msgSender()` report, and only once that
/// router has been approved via this pool's own allowedRouters. This two-level check stops an
/// arbitrary contract from spoofing an allowed identity.
contract PermissionedPoolPluginImplementation is IPermissionedPoolPluginImplementation {
  /// @notice Initialize Permissioned Pool plugin
  function initializePermissionedPool(address _allowlistCheckerRegistry) external {
    PermissionedPoolStorage.layout().allowlistCheckerRegistry = _allowlistCheckerRegistry;
  }

  /// @notice Set Allowlist Checker Registry
  function setAllowlistCheckerRegistry(address _allowlistCheckerRegistry) external {
    PermissionedPoolStorage.layout().allowlistCheckerRegistry = _allowlistCheckerRegistry;
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function setRouterAllowed(address router, bool allowed) external {
    PermissionedPoolStorage.layout().allowedRouters[router] = allowed;
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifySwap(address pool, address sender) external view {
    _verifyTokenPair(pool, sender, PermissionFlags.SWAP_ALLOWED);
  }

  /// @inheritdoc IPermissionedPoolPluginImplementation
  function verifyAddLiquidity(address pool, address sender) external view {
    _verifyTokenPair(pool, sender, PermissionFlags.LIQUIDITY_ALLOWED);
  }

  /// @dev Both tokens of the pair are checked independently, even if only one side is permissioned.
  function _verifyTokenPair(address pool, address sender, PermissionFlag requiredFlag) internal view {
    IAllowlistCheckerRegistry registry = _registry();
    if (address(registry) == address(0)) return;

    address token0 = IAlgebraPoolImmutables(pool).token0();
    address token1 = IAlgebraPoolImmutables(pool).token1();

    _verifyToken(registry, token0, sender, requiredFlag);
    _verifyToken(registry, token1, sender, requiredFlag);
  }

  /// @dev A token without a checker assigned is unpermissioned and always passes.
  function _verifyToken(IAllowlistCheckerRegistry registry, address token, address sender, PermissionFlag requiredFlag) internal view {
    address checkerAddress = registry.getChecker(token);
    if (checkerAddress == address(0)) return;

    address realSender = _resolveRealSender(sender);
    PermissionFlag flags = IAllowlistChecker(checkerAddress).checkAllowlist(realSender, token);
    if ((flags & requiredFlag) == PermissionFlags.NONE) revert IPermissionedPoolPlugin.NotAllowed(token, realSender);
  }

  /// @dev `sender` is trusted as-is unless it is itself a governance-approved router.
  /// An unapproved contract can't spoof a different identity because we never call its
  /// `msgSender()` in the first place. Router trust is this pool's own storage, not the registry's.
  function _resolveRealSender(address sender) internal view returns (address) {
    if (!PermissionedPoolStorage.layout().allowedRouters[sender]) return sender;

    try IMsgSender(sender).msgSender() returns (address realSender) {
      return realSender;
    } catch {
      revert IPermissionedPoolPlugin.RouterMsgSenderCallFailed();
    }
  }

  function _registry() internal view returns (IAllowlistCheckerRegistry) {
    return IAllowlistCheckerRegistry(PermissionedPoolStorage.layout().allowlistCheckerRegistry);
  }
}
