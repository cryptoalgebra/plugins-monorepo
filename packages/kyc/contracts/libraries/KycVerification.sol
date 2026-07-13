// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/onchainid/IIdFactory.sol';
import '../interfaces/onchainid/IIdentity.sol';
import '../interfaces/onchainid/IClaimIssuer.sol';
import './KycStorage.sol';

/// @title KYC Verification Library
/// @notice Shared OnchainID eligibility check, used by both KycPluginImplementation (reverting path)
/// and KycConnector (external view for frontends)
library KycVerification {
  /// @notice Check if a wallet is eligible to trade on a KYC-gated pool
  /// @dev Returns true when KYC is disabled (identity factory is zero address) or paused.
  /// Otherwise the wallet's OnchainID identity must hold a claim with the required topic
  /// issued by a trusted issuer, and the issuer must confirm the claim is still valid.
  /// @param l The KYC storage layout of the plugin
  /// @param wallet The wallet address (tx.origin of the end-user)
  /// @return True if the wallet may trade
  function isEligible(KycStorage.Layout storage l, address wallet) internal view returns (bool) {
    address identityFactory = l.identityFactory;
    if (identityFactory == address(0)) return true;
    if (l.paused) return true;

    address identityAddress = IIdFactory(identityFactory).getIdentity(wallet);
    if (identityAddress == address(0)) return false;

    IIdentity identity = IIdentity(identityAddress);
    bytes32[] memory claimIds = identity.getClaimIdsByTopic(l.requiredTopic);

    for (uint256 i; i < claimIds.length; ++i) {
      (uint256 topic, , address issuer, bytes memory signature, bytes memory data, ) = identity.getClaim(claimIds[i]);

      if (!l.trustedIssuers[issuer]) continue;

      if (IClaimIssuer(issuer).isClaimValid(identity, topic, signature, data)) {
        return true;
      }
    }

    return false;
  }
}
