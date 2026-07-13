// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IKycPlugin.sol';
import './interfaces/IKycPluginImplementation.sol';
import './libraries/KycStorage.sol';
import './libraries/KycVerification.sol';

/// @title KYC Connector
/// @notice Delegatecall interface to KYC plugin implementation
/// @dev Uses tx.origin for user identification
/// Non-verified users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
abstract contract KycConnector is BaseConnector, IKycPlugin {
  using Plugins for uint8;

  string internal constant KYC_MODULE_NAME = 'KYC Plugin';
  uint8 internal constant KYC_PLUGIN_CONFIG =
    uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG | Plugins.AFTER_INIT_FLAG);

  address internal immutable kycImplementation;

  constructor(address _kycImplementation) {
    kycImplementation = _kycImplementation;
  }

  function _initializeKyc(address identityFactory, uint256 requiredTopic) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.initializeKyc, (identityFactory, requiredTopic)));
  }

  /// @dev Verify a user (tx.origin) against OnchainID claims, reverts with KycNotVerified if not verified
  function _kycVerify(address user) internal {
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.verify, (user)));
  }

  /// @inheritdoc IKycPlugin
  function setKycIdentityFactory(address identityFactory) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setIdentityFactory, (identityFactory)));
    emit KycIdentityFactoryUpdated(identityFactory);
  }

  /// @inheritdoc IKycPlugin
  function setKycRequiredTopic(uint256 requiredTopic) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setRequiredTopic, (requiredTopic)));
    emit KycRequiredTopicUpdated(requiredTopic);
  }

  /// @inheritdoc IKycPlugin
  function setKycTrustedIssuer(address issuer, bool trusted) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setTrustedIssuer, (issuer, trusted)));
    emit KycTrustedIssuerUpdated(issuer, trusted);
  }

  /// @inheritdoc IKycPlugin
  function setKycTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setTrustedIssuersBatch, (issuers, trusted)));
    for (uint256 i = 0; i < issuers.length; i++) {
      emit KycTrustedIssuerUpdated(issuers[i], trusted[i]);
    }
  }

  /// @inheritdoc IKycPlugin
  function setKycPaused(bool paused) external override {
    _authorize();
    _delegateCall(kycImplementation, abi.encodeCall(IKycPluginImplementation.setPaused, (paused)));
    emit KycPausedUpdated(paused);
  }

  /// @inheritdoc IKycPlugin
  /// @dev Implemented directly in the connector (not via delegatecall) because delegatecall
  /// is not allowed in view functions; logic is shared with the implementation via KycVerification
  function isTraderEligible(address wallet) external view override returns (bool) {
    return KycVerification.isEligible(KycStorage.layout(), wallet);
  }

  /// @inheritdoc IKycPlugin
  function kycIdentityFactory() external view override returns (address) {
    return KycStorage.layout().identityFactory;
  }

  /// @inheritdoc IKycPlugin
  function kycRequiredTopic() external view override returns (uint256) {
    return KycStorage.layout().requiredTopic;
  }

  /// @inheritdoc IKycPlugin
  function isKycTrustedIssuer(address issuer) external view override returns (bool) {
    return KycStorage.layout().trustedIssuers[issuer];
  }

  /// @inheritdoc IKycPlugin
  function isKycPaused() external view override returns (bool) {
    return KycStorage.layout().paused;
  }
}
