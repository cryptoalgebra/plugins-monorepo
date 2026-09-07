// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAceIdentityValidator
/// @notice Minimal subset of the Chainlink ACE IIdentityValidator interface, as implemented by
/// CredentialRegistryIdentityValidatorPolicy and GroupedIdentityValidatorPolicy
/// (https://github.com/smartcontractkit/chainlink-ace)
/// @dev Although those contracts are ACE policies, `validate` is an ordinary public view function:
/// calling it needs no PolicyEngine, no extractor and no attachment. It lets the credential
/// requirements (which types, quorum across several registries, jurisdiction data validators) live in
/// ACE platform configuration instead of in this checker.
interface IAceIdentityValidator {
  /// @notice Whether `account` satisfies every credential requirement configured on this validator
  /// @dev Specified as MUST NOT revert; the checker guards the call regardless
  /// @param account The wallet address to validate
  /// @param context Optional context bytes forwarded to the validator
  /// @return True if all configured requirements are met
  function validate(address account, bytes calldata context) external view returns (bool);
}
