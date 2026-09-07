// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './interfaces/ace/IAceIdentityRegistry.sol';
import './interfaces/ace/IAceCredentialRegistry.sol';
import './interfaces/ace/IAceIdentityValidator.sol';
import './interfaces/IAllowlistChecker.sol';
import './interfaces/IAceAllowlistChecker.sol';
import './libraries/PermissionFlags.sol';

/// @title ACE Allowlist Checker
/// @notice IAllowlistChecker implementation gating on Chainlink ACE credentials.
contract AceAllowlistChecker is IAceAllowlistChecker, ERC165 {
  /// @inheritdoc IAceAllowlistChecker
  address public immutable override admin;

  /// @inheritdoc IAceAllowlistChecker
  address public override identityRegistry;

  /// @inheritdoc IAceAllowlistChecker
  address public override credentialRegistry;

  Rule[] private _defaultRules;
  mapping(address token => Rule[] rules) private _tokenRules;

  modifier onlyAdmin() {
    if (msg.sender != admin) revert OnlyAdmin();
    _;
  }

  constructor(address _admin, address _identityRegistry, address _credentialRegistry, Rule[] memory rules) {
    if (_admin == address(0)) revert ZeroAddress();
    admin = _admin;
    _setRegistries(_identityRegistry, _credentialRegistry);
    _setRules(_defaultRules, rules);
  }

  /// @inheritdoc IAllowlistChecker
  /// @dev The CCID lookup is deferred until a Credential rule actually needs it, so a checker
  /// configured purely with Validator rules never pays for it.
  function checkAllowlist(address account, address tokenAddress) external view override returns (PermissionFlag) {
    Rule[] storage rules = _rulesFor(tokenAddress);
    uint256 rulesLength = rules.length;
    if (rulesLength == 0) return PermissionFlags.NONE;

    PermissionFlag granted = PermissionFlags.NONE;
    bytes32 ccid;
    bool ccidResolved;

    for (uint256 i; i < rulesLength; ++i) {
      Rule storage rule = rules[i];
      // Nothing this rule could add, so skip the external call entirely
      if ((granted & rule.flags) == rule.flags) continue;

      bool satisfied;
      if (rule.kind == RuleKind.Validator) {
        // The validator resolves the account itself, so it needs no CCID from us
        satisfied = IAceIdentityValidator(rule.validator).validate(account, '');
      } else {
        if (!ccidResolved) {
          ccidResolved = true;
          ccid = IAceIdentityRegistry(identityRegistry).getIdentity(account);
        }
        // A wallet with no identity on this chain can hold no credentials
        if (ccid != bytes32(0)) {
          satisfied = IAceCredentialRegistry(credentialRegistry).validate(ccid, rule.credentialTypeId, '');
        }
      }

      if (satisfied) granted = granted | rule.flags;
    }

    return granted;
  }

  /// @inheritdoc IAceAllowlistChecker
  function setRegistries(address newIdentityRegistry, address newCredentialRegistry) external override onlyAdmin {
    _setRegistries(newIdentityRegistry, newCredentialRegistry);
  }

  /// @inheritdoc IAceAllowlistChecker
  function setDefaultRules(Rule[] calldata rules) external override onlyAdmin {
    _setRules(_defaultRules, rules);
    emit DefaultRulesUpdated(rules);
  }

  /// @inheritdoc IAceAllowlistChecker
  function setTokenRules(address token, Rule[] calldata rules) external override onlyAdmin {
    _setRules(_tokenRules[token], rules);
    emit TokenRulesUpdated(token, rules);
  }

  /// @inheritdoc IAceAllowlistChecker
  function getDefaultRules() external view override returns (Rule[] memory) {
    return _defaultRules;
  }

  /// @inheritdoc IAceAllowlistChecker
  function getTokenRules(address token) external view override returns (Rule[] memory) {
    return _tokenRules[token];
  }

  /// @inheritdoc IAceAllowlistChecker
  function getEffectiveRules(address token) external view override returns (Rule[] memory) {
    return _rulesFor(token);
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
    return interfaceId == type(IAllowlistChecker).interfaceId || super.supportsInterface(interfaceId);
  }

  /// @dev A token's own rules take precedence; an empty override means "use the defaults"
  function _rulesFor(address token) private view returns (Rule[] storage) {
    Rule[] storage tokenSpecific = _tokenRules[token];
    if (tokenSpecific.length != 0) return tokenSpecific;
    return _defaultRules;
  }

  function _setRegistries(address newIdentityRegistry, address newCredentialRegistry) private {
    if (newIdentityRegistry == address(0) || newCredentialRegistry == address(0)) revert ZeroAddress();
    identityRegistry = newIdentityRegistry;
    credentialRegistry = newCredentialRegistry;
    emit RegistriesUpdated(newIdentityRegistry, newCredentialRegistry);
  }

  /// @dev Rejects rules that could never grant anything, since such a rule is a silent misconfiguration
  function _setRules(Rule[] storage target, Rule[] memory rules) private {
    while (target.length != 0) target.pop();

    for (uint256 i; i < rules.length; ++i) {
      Rule memory rule = rules[i];
      if (rule.flags == PermissionFlags.NONE) revert InvalidRule();
      if (rule.kind == RuleKind.Validator) {
        if (rule.validator == address(0)) revert InvalidRule();
      } else if (rule.credentialTypeId == bytes32(0)) {
        revert InvalidRule();
      }
      target.push(rule);
    }
  }
}
