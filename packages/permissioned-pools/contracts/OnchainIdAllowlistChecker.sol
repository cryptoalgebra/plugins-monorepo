// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './interfaces/onchainid/IIdFactory.sol';
import './interfaces/onchainid/IIdentity.sol';
import './interfaces/onchainid/IClaimIssuer.sol';
import './interfaces/IAllowlistChecker.sol';
import './interfaces/IOnchainIdAllowlistChecker.sol';
import './libraries/PermissionFlags.sol';

/// @title Onchain ID Allowlist Checker
/// @notice Example IAllowlistChecker implementation gating on OnchainID claims.
/// @dev An account is eligible if its identity holds a claim with the required topic, issued by
/// a trusted issuer, and the issuer confirms the claim hasn't been revoked.
/// No separate kill switch. To stop trading, revoke claims or untrust the issuer via setTrustedIssuer.
/// AllowlistCheckerRegistry.setChecker(token, address(0)) fully unpermissions a token.
contract OnchainIdAllowlistChecker is IOnchainIdAllowlistChecker, ERC165 {
  /// @inheritdoc IOnchainIdAllowlistChecker
  address public immutable override admin;

  /// @inheritdoc IOnchainIdAllowlistChecker
  address public immutable override identityFactory;

  /// @inheritdoc IOnchainIdAllowlistChecker
  uint256 public override requiredTopic;

  /// @inheritdoc IOnchainIdAllowlistChecker
  mapping(address => bool) public override isTrustedIssuer;

  modifier onlyAdmin() {
    if (msg.sender != admin) revert OnlyAdmin();
    _;
  }

  constructor(address _admin, address _identityFactory, uint256 _requiredTopic) {
    admin = _admin;
    identityFactory = _identityFactory;
    requiredTopic = _requiredTopic;
  }

  /// @inheritdoc IOnchainIdAllowlistChecker
  function setRequiredTopic(uint256 newRequiredTopic) external override onlyAdmin {
    requiredTopic = newRequiredTopic;
    emit RequiredTopicUpdated(newRequiredTopic);
  }

  /// @inheritdoc IOnchainIdAllowlistChecker
  function setTrustedIssuer(address issuer, bool trusted) external override onlyAdmin {
    isTrustedIssuer[issuer] = trusted;
    emit TrustedIssuerUpdated(issuer, trusted);
  }

  /// @inheritdoc IOnchainIdAllowlistChecker
  function setTrustedIssuersBatch(address[] calldata issuers, bool[] calldata trusted) external override onlyAdmin {
    if (issuers.length != trusted.length) revert LengthMismatch();
    for (uint256 i = 0; i < issuers.length; i++) {
      isTrustedIssuer[issuers[i]] = trusted[i];
      emit TrustedIssuerUpdated(issuers[i], trusted[i]);
    }
  }

  /// @inheritdoc IOnchainIdAllowlistChecker
  function isEligible(address account) public view override returns (bool) {
    address identityAddress = IIdFactory(identityFactory).getIdentity(account);
    if (identityAddress == address(0)) return false;

    IIdentity identity = IIdentity(identityAddress);
    bytes32[] memory claimIds = identity.getClaimIdsByTopic(requiredTopic);

    for (uint256 i; i < claimIds.length; ++i) {
      (uint256 topic, , address issuer, bytes memory signature, bytes memory data, ) = identity.getClaim(claimIds[i]);

      if (!isTrustedIssuer[issuer]) continue;
      if (IClaimIssuer(issuer).isClaimValid(identity, topic, signature, data)) return true;
    }

    return false;
  }

  /// @inheritdoc IAllowlistChecker
  function checkAllowlist(address account, address) external view override returns (PermissionFlag) {
    return isEligible(account) ? PermissionFlags.ALL_ALLOWED : PermissionFlags.NONE;
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IAllowlistChecker).interfaceId || super.supportsInterface(interfaceId);
  }
}
