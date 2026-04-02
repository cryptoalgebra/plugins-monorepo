// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IKycRegistry.sol';
import './interfaces/IKycPlugin.sol';
import './interfaces/IKycPluginImplementation.sol';
import './libraries/KycStorage.sol';

/// @title KYC Plugin Implementation
/// @notice Contains all business logic for KYC verification, executed via delegatecall
/// @dev Uses tx.origin to identify end-users. Whitelist check is done against KycRegistry.
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
contract KycPluginImplementation is IKycPluginImplementation {

  /// @notice Initialize KYC plugin
  /// @param _kycRegistry Address of KYC registry
  function initializeKyc(address _kycRegistry) external {
    KycStorage.layout().kycRegistry = _kycRegistry;
  }

  /// @notice Set KYC registry
  /// @param _kycRegistry New KYC registry address
  function setKycRegistry(address _kycRegistry) external {
    KycStorage.layout().kycRegistry = _kycRegistry;
  }

  /// @inheritdoc IKycPluginImplementation
  function verifySwap(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IKycPluginImplementation
  function verifyAddLiquidity(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IKycPluginImplementation
  function verifyFlash(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @inheritdoc IKycPluginImplementation
  function verifyInitialize(address pool) external view {
    _requireWhitelisted(pool);
  }

  /// @dev Check that tx.origin is whitelisted, revert if not
  function _requireWhitelisted(address) internal view {
    address kycRegistry = KycStorage.layout().kycRegistry;
    if (kycRegistry == address(0)) return;

    IKycRegistry registry = IKycRegistry(kycRegistry);
    if (registry.isPaused()) return;

    if (!registry.isWhitelisted(tx.origin)) revert IKycPlugin.KycNotWhitelisted();
  }
}
