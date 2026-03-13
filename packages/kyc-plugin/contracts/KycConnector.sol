// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IKycPlugin.sol';
import './interfaces/IKycPluginImplementation.sol';
import './libraries/KycStorage.sol';

/// @title KYC Connector
/// @notice Delegatecall interface to KYC plugin implementation
/// @dev Uses tx.origin for user identification — no IMessageSender required on routers.
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
abstract contract KycConnector is BaseConnector, IKycPlugin {
  using Plugins for uint8;

  string internal constant KYC_MODULE_NAME = 'KYC Plugin';
  uint8 internal constant KYC_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG | Plugins.AFTER_INIT_FLAG);

  /// @dev Immutable implementation address — set in constructor, changes only on full plugin upgrade
  address internal immutable kycImplementation;

  constructor(address _kycImplementation) {
    kycImplementation = _kycImplementation;
  }

  /// @notice Initialize KYC plugin via delegatecall
  function _initializeKyc(address _kycRegistry) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.initializeKyc, (_kycRegistry)));
  }

  /// @notice Verify swap — reverts if tx.origin not whitelisted
  /// @param pool The pool address
  function _kycVerifySwap(address pool) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.verifySwap, (pool)));
  }

  /// @notice Verify add liquidity — reverts if tx.origin not whitelisted
  /// @param pool The pool address
  function _kycVerifyAddLiquidity(address pool) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.verifyAddLiquidity, (pool)));
  }

  /// @notice Verify flash loan — reverts if tx.origin not whitelisted
  /// @param pool The pool address
  function _kycVerifyFlash(address pool) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.verifyFlash, (pool)));
  }

  /// @notice Verify pool initialization — reverts if tx.origin not whitelisted
  /// @param pool The pool address
  function _kycVerifyInitialize(address pool) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.verifyInitialize, (pool)));
  }

  // ###### Public Interface (IKycPlugin) ######

  /// @inheritdoc IKycPlugin
  function setKycRegistry(address registry) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setKycRegistry, (registry)));
    emit KycRegistryUpdated(registry);
  }

  /// @inheritdoc IKycPlugin
  function getKycRegistry() external view override returns (address) {
    return KycStorage.layout().kycRegistry;
  }
}
