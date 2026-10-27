// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';
import '../interfaces/IManagedSwapFeePlugin.sol';
import './ManagedFeeStorage.sol';

/// @title ManagedFee signature checks
/// @dev Shared by the implementation, which spends the nonce in a swap, and the connector, which quotes the fee
library ManagedFeeVerifier {
  using ECDSA for bytes32;

  /// @notice Checks the signed fee in pluginData without spending its nonce
  /// @return fee The signed fee
  /// @return nonce The nonce to mark as used once the fee is applied
  function verify(ManagedFeeStorage.Layout storage layout, bytes memory pluginData) internal view returns (uint24 fee, bytes32 nonce) {
    IManagedSwapFeePlugin.PluginData memory data = abi.decode(pluginData, (IManagedSwapFeePlugin.PluginData));
    (nonce, fee) = (data.nonce, data.fee);

    if (fee >= 1000000) revert IManagedSwapFeePlugin.FeeExceedsLimit();
    if (layout.usedNonces[nonce]) revert IManagedSwapFeePlugin.InvalidNonce();
    if (data.expire < block.timestamp) revert IManagedSwapFeePlugin.Expired();
    // solhint-disable-next-line avoid-tx-origin
    if (data.user != tx.origin) revert IManagedSwapFeePlugin.NotAllowed();

    bytes32 hash = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(nonce, fee, data.user, data.expire)));
    if (!layout.whitelistedAddresses[hash.recover(data.signature)]) revert IManagedSwapFeePlugin.NotWhitelisted();
  }
}
