// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IKycPlugin.sol';
import './interfaces/IKycPluginImplementation.sol';
import './libraries/KycStorage.sol';
import './libraries/KycVerification.sol';

/// @title KYC Plugin Implementation
/// @notice Contains all business logic for OnchainID KYC verification, executed via delegatecall
/// @dev Uses tx.origin to identify end-users. A user is verified if their OnchainID identity
/// holds a claim with the required topic issued by a trusted issuer and the issuer confirms
/// the claim is still valid. Non-verified users are fully blocked from swap, add liquidity,
/// flash and pool init. Remove liquidity is always allowed.
contract KycPluginImplementation is IKycPluginImplementation {

  /// @notice Initialize KYC plugin
  /// @param identityFactory Address of OnchainID identity factory (zero address disables KYC)
  /// @param requiredTopic The claim topic required for verification
  function initializeKyc(address identityFactory, uint256 requiredTopic) external {
    KycStorage.Layout storage l = KycStorage.layout();
    l.identityFactory = identityFactory;
    l.requiredTopic = requiredTopic;
  }

  /// @inheritdoc IKycPluginImplementation
  function setIdentityFactory(address identityFactory) external {
    KycStorage.layout().identityFactory = identityFactory;
  }

  /// @inheritdoc IKycPluginImplementation
  function setRequiredTopic(uint256 requiredTopic) external {
    KycStorage.layout().requiredTopic = requiredTopic;
  }

  /// @inheritdoc IKycPluginImplementation
  function setTrustedIssuer(address issuer, bool trusted) external {
    KycStorage.layout().trustedIssuers[issuer] = trusted;
  }

  /// @inheritdoc IKycPluginImplementation
  function setTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external {
    require(issuers.length == trusted.length, 'Length mismatch');
    KycStorage.Layout storage l = KycStorage.layout();
    for (uint256 i = 0; i < issuers.length; i++) {
      l.trustedIssuers[issuers[i]] = trusted[i];
    }
  }

  /// @inheritdoc IKycPluginImplementation
  function setPaused(bool paused) external {
    KycStorage.layout().paused = paused;
  }

  /// @inheritdoc IKycPluginImplementation
  function verify(address user) external view {
    if (!KycVerification.isEligible(KycStorage.layout(), user)) revert IKycPlugin.KycNotVerified();
  }
}
