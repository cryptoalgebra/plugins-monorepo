// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/onchainid/IIdentity.sol';
import '../../interfaces/onchainid/IClaimIssuer.sol';

/// @title Mock OnchainID ClaimIssuer
/// @notice Test mock with settable claim validity, simulates revocation
contract MockClaimIssuer is IClaimIssuer {
  bool public claimValid = true;

  function setClaimValid(bool valid) external {
    claimValid = valid;
  }

  /// @inheritdoc IClaimIssuer
  function isClaimValid(IIdentity, uint256, bytes calldata, bytes calldata) external view override returns (bool) {
    return claimValid;
  }
}
