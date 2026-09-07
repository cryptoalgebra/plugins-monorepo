// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/ace/IAceIdentityValidator.sol';

/// @title Mock ACE IdentityValidator
/// @notice Test mock standing in for CredentialRegistryIdentityValidatorPolicy
contract MockAceIdentityValidator is IAceIdentityValidator {
  mapping(address account => bool valid) private results;

  /// @notice When set, validate reverts, standing in for a misconfigured validator address
  bool public shouldRevert;

  function setValid(address account, bool valid) external {
    results[account] = valid;
  }

  function setShouldRevert(bool value) external {
    shouldRevert = value;
  }

  /// @inheritdoc IAceIdentityValidator
  function validate(address account, bytes calldata) external view override returns (bool) {
    require(!shouldRevert, 'MockAceIdentityValidator: forced revert');
    return results[account];
  }
}
