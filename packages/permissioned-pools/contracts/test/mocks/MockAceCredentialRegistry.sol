// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/ace/IAceCredentialRegistry.sol';

/// @title Mock ACE CredentialRegistry
/// @notice Test mock for credential validity lookups
contract MockAceCredentialRegistry is IAceCredentialRegistry {
  mapping(bytes32 ccid => mapping(bytes32 credentialTypeId => bool valid)) private credentials;

  /// @notice When set, validate reverts, exercising the checker's defensive guard
  bool public shouldRevert;

  function setCredential(bytes32 ccid, bytes32 credentialTypeId, bool valid) external {
    credentials[ccid][credentialTypeId] = valid;
  }

  function setShouldRevert(bool value) external {
    shouldRevert = value;
  }

  /// @inheritdoc IAceCredentialRegistry
  function validate(bytes32 ccid, bytes32 credentialTypeId, bytes calldata) external view override returns (bool) {
    require(!shouldRevert, 'MockAceCredentialRegistry: forced revert');
    return credentials[ccid][credentialTypeId];
  }
}
