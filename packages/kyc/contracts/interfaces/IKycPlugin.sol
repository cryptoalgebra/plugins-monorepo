// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IKycPlugin
/// @notice Public interface for the KYC plugin module
/// @dev Uses tx.origin to identify users. A user is verified if their OnchainID identity
/// holds a claim with the required topic issued by a trusted issuer and the issuer confirms
/// the claim is still valid. Non-verified users are fully blocked from swap, add liquidity,
/// flash and pool init. Remove liquidity is always allowed.
interface IKycPlugin {
  /// @notice Emitted when the OnchainID identity factory is updated
  event KycIdentityFactoryUpdated(address identityFactory);

  /// @notice Emitted when the required claim topic is updated
  event KycRequiredTopicUpdated(uint256 requiredTopic);

  /// @notice Emitted when a claim issuer trusted status is updated
  event KycTrustedIssuerUpdated(address indexed issuer, bool trusted);

  /// @notice Emitted when KYC verification is paused or unpaused
  event KycPausedUpdated(bool paused);

  /// @notice The user (tx.origin) is not KYC-verified
  error KycNotVerified();

  /// @notice Check if a wallet is eligible to trade on this pool (for frontends)
  /// @dev Returns true when KYC is disabled or paused; otherwise checks OnchainID claims
  /// @param wallet The wallet address to check
  /// @return True if the wallet may trade
  function isTraderEligible(address wallet) external view returns (bool);

  /// @notice Set the OnchainID identity factory address (zero address disables KYC)
  /// @param identityFactory The new identity factory address
  function setKycIdentityFactory(address identityFactory) external;

  /// @notice Set the required claim topic
  /// @param requiredTopic The new required claim topic
  function setKycRequiredTopic(uint256 requiredTopic) external;

  /// @notice Add or remove a trusted claim issuer
  /// @param issuer The claim issuer address
  /// @param trusted True to trust, false to remove
  function setKycTrustedIssuer(address issuer, bool trusted) external;

  /// @notice Batch add/remove trusted claim issuers
  /// @param issuers Array of claim issuer addresses
  /// @param trusted Array of trusted statuses
  function setKycTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external;

  /// @notice Pause or unpause KYC verification (emergency — all checks bypass while paused)
  /// @param paused True to pause
  function setKycPaused(bool paused) external;

  /// @notice Get the OnchainID identity factory address
  /// @return The identity factory address
  function kycIdentityFactory() external view returns (address);

  /// @notice Get the required claim topic
  /// @return The required claim topic
  function kycRequiredTopic() external view returns (uint256);

  /// @notice Check if a claim issuer is trusted
  /// @param issuer The claim issuer address
  /// @return True if trusted
  function isKycTrustedIssuer(address issuer) external view returns (bool);

  /// @notice Whether KYC verification is paused
  /// @return True if paused
  function isKycPaused() external view returns (bool);
}
