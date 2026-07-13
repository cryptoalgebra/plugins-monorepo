// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title IKycPluginImplementation
/// @notice Interface for KYC plugin implementation contract
/// @dev Used for type-safe delegatecall encoding in KycConnector.
interface IKycPluginImplementation {
  function initializeKyc(address identityFactory, uint256 requiredTopic) external;
  function setIdentityFactory(address identityFactory) external;
  function setRequiredTopic(uint256 requiredTopic) external;
  function setTrustedIssuer(address issuer, bool trusted) external;
  function setTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external;
  function setPaused(bool paused) external;

  /// @notice Verify a user against OnchainID claims — reverts with KycNotVerified if the user
  /// has no valid claim with the required topic from a trusted issuer.
  /// No-op if KYC is disabled (identity factory is zero address) or paused.
  /// @param user The end-user address (tx.origin)
  function verify(address user) external view;
}
