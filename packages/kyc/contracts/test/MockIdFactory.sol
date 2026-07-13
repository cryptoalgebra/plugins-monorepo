// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/onchainid/IIdFactory.sol';

/// @title Mock OnchainID IdFactory
/// @notice Test mock for wallet => identity resolution
contract MockIdFactory is IIdFactory {
  mapping(address wallet => address identity) private identities;

  function setIdentity(address wallet, address identity) external {
    identities[wallet] = identity;
  }

  /// @inheritdoc IIdFactory
  function getIdentity(address _wallet) external view override returns (address) {
    return identities[_wallet];
  }
}
