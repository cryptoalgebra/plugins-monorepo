// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IIdFactory
/// @notice Minimal subset of the OnchainID IdFactory interface (https://github.com/onchain-id/solidity)
/// @dev Only the functions used by the Onchain ID allowlist checker are declared here to avoid
/// pragma conflicts with the upstream onchain-id solidity package
interface IIdFactory {
  /// @notice Get the identity contract linked to a wallet
  /// @param _wallet The wallet address
  /// @return The identity contract address, or zero address if the wallet has no identity
  function getIdentity(address _wallet) external view returns (address);
}
