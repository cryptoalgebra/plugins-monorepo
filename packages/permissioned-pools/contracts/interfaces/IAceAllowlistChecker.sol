// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import { PermissionFlag } from '../libraries/PermissionFlags.sol';
import './IAllowlistChecker.sol';

/// @title IAceAllowlistChecker
/// @notice IAllowlistChecker backed by Chainlink ACE cross-chain identity credentials.
/// @dev An account's permissions are the union of the flags of every rule it satisfies, so a single
/// checker can grant swaps on one credential and liquidity provision on another. Accounts with no
/// CCID, and tokens with no rules, resolve to no permissions (fail closed).
/// Not tied to a single token: the same instance can serve multiple assets, with optional per-token
/// rule overrides.
interface IAceAllowlistChecker is IAllowlistChecker {
  /// @notice How a rule decides whether an account satisfies it
  /// @param Credential Read the ACE registries directly: resolve the CCID, then check `credentialTypeId`
  /// @param Validator Delegate to an ACE identity validator, letting requirements be reconfigured
  /// on the ACE platform without touching this contract
  enum RuleKind {
    Credential,
    Validator
  }

  /// @notice A single "if the account has this, it may do that" rule
  /// @param validator The ACE identity validator to ask; ignored when `kind` is Credential
  /// @param flags The permissions granted when the rule is satisfied
  /// @param kind Which of the two checks this rule performs
  /// @param credentialTypeId The ACE credential type hash; ignored when `kind` is Validator
  struct Rule {
    address validator;
    PermissionFlag flags;
    RuleKind kind;
    bytes32 credentialTypeId;
  }

  event RegistriesUpdated(address indexed identityRegistry, address indexed credentialRegistry);
  event DefaultRulesUpdated(Rule[] rules);
  event TokenRulesUpdated(address indexed token, Rule[] rules);

  error OnlyAdmin();
  error ZeroAddress();
  error InvalidRule();

  /// @notice The address authorized to manage this checker's configuration
  function admin() external view returns (address);

  /// @notice The ACE IdentityRegistry used to resolve a wallet's CCID
  function identityRegistry() external view returns (address);

  /// @notice The ACE CredentialRegistry queried for credential validity
  function credentialRegistry() external view returns (address);

  /// @notice The rules applied to tokens without a per-token override
  function getDefaultRules() external view returns (Rule[] memory);

  /// @notice The per-token rule override for `token`, empty if none is set
  function getTokenRules(address token) external view returns (Rule[] memory);

  /// @notice The rules actually applied to `token`: its override if set, otherwise the defaults
  function getEffectiveRules(address token) external view returns (Rule[] memory);

  /// @notice Point the checker at a different pair of ACE registries
  /// @dev Kept mutable because ACE deployments are per-organization and per-chain: the registries
  /// backing a token can change, or differ from the ones this checker was deployed against
  function setRegistries(address newIdentityRegistry, address newCredentialRegistry) external;

  /// @notice Replace the rules applied to tokens without an override
  function setDefaultRules(Rule[] calldata rules) external;

  /// @notice Replace the rules applied to `token`; pass an empty array to fall back to the defaults
  function setTokenRules(address token, Rule[] calldata rules) external;
}
