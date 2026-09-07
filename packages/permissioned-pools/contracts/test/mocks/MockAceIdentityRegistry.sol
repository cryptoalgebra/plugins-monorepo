// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../interfaces/ace/IAceIdentityRegistry.sol';

/// @title Mock ACE IdentityRegistry
/// @notice Test mock for wallet to CCID resolution
contract MockAceIdentityRegistry is IAceIdentityRegistry {
  mapping(address wallet => bytes32 ccid) private ccids;

  /// @notice When set, getIdentity reverts, exercising the checker's defensive guard
  bool public shouldRevert;

  function setIdentity(address wallet, bytes32 ccid) external {
    ccids[wallet] = ccid;
  }

  function setShouldRevert(bool value) external {
    shouldRevert = value;
  }

  /// @inheritdoc IAceIdentityRegistry
  function getIdentity(address account) external view override returns (bytes32) {
    require(!shouldRevert, 'MockAceIdentityRegistry: forced revert');
    return ccids[account];
  }
}
