// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './IAllowlistChecker.sol';

/// @title IOnchainIdAllowlistChecker
/// @notice Example IAllowlistChecker backed by OnchainID claims: an account is eligible when its
/// OnchainID identity holds a claim with the required topic, issued by a trusted issuer, and the
/// issuer confirms the claim is still valid.
/// @dev Not tied to a single token — the same checker instance can be assigned to multiple tokens
/// via AllowlistCheckerRegistry.setChecker, per IAllowlistChecker's `tokenAddress` parameter.
interface IOnchainIdAllowlistChecker is IAllowlistChecker {
  event RequiredTopicUpdated(uint256 requiredTopic);
  event TrustedIssuerUpdated(address indexed issuer, bool trusted);

  error OnlyAdmin();
  error LengthMismatch();

  /// @notice The address authorized to manage this checker's configuration
  function admin() external view returns (address);

  /// @notice The OnchainID identity factory used to resolve a wallet's identity contract
  function identityFactory() external view returns (address);

  /// @notice The claim topic required for eligibility
  function requiredTopic() external view returns (uint256);

  /// @notice Whether `issuer` is trusted to sign claims for the required topic
  function isTrustedIssuer(address issuer) external view returns (bool);

  /// @notice Whether `account`'s OnchainID identity holds a valid claim from a trusted issuer
  function isEligible(address account) external view returns (bool);

  /// @notice Set the required claim topic
  function setRequiredTopic(uint256 newRequiredTopic) external;

  /// @notice Add or remove a trusted claim issuer
  function setTrustedIssuer(address issuer, bool trusted) external;

  /// @notice Batch add/remove trusted claim issuers
  function setTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external;
}
