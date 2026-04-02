// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IAccessListRegistry.sol';
import './interfaces/IAccessListPlugin.sol';
import './interfaces/IAccessListPluginImplementation.sol';
import './libraries/AccessListStorage.sol';

/// @title Access List Plugin Implementation
/// @notice Contains all business logic for Access List verification, executed via delegatecall
/// @dev Uses tx.origin to identify end-users. Whitelist check is done against AccessListRegistry.
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
contract AccessListPluginImplementation is IAccessListPluginImplementation {

  /// @notice Initialize Access List plugin
  /// @param _accessListRegistry Address of Access List registry
  function initializeAccessList(address _accessListRegistry) external {
    AccessListStorage.layout().accessListRegistry = _accessListRegistry;
  }

  /// @notice Set Access List registry
  /// @param _accessListRegistry New Access List registry address
  function setAccessListRegistry(address _accessListRegistry) external {
    AccessListStorage.layout().accessListRegistry = _accessListRegistry;
  }

  /// @inheritdoc IAccessListPluginImplementation
  function verifySwap(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IAccessListPluginImplementation
  function verifyAddLiquidity(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IAccessListPluginImplementation
  function verifyFlash(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IAccessListPluginImplementation
  function verifyInitialize(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @dev Check that tx.origin is whitelisted, revert if not
  function _requireWhitelisted(address) internal view {
    address accessListRegistry = AccessListStorage.layout().accessListRegistry;
    if (accessListRegistry == address(0)) return;

    IAccessListRegistry registry = IAccessListRegistry(accessListRegistry);
    if (registry.isPaused()) return;

    if (!registry.isWhitelisted(tx.origin)) revert IAccessListPlugin.AccessListNotWhitelisted();
  }
}
