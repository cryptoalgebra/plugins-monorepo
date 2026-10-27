// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import './FeeAuctionStorage.sol';

/// @title FeeAuction math
/// @dev Shared by the implementation, which charges the tax in a swap, and the connector, which quotes it
library FeeAuctionMath {
  /// @notice The MEV tax of the current transaction, zero while the tax is off
  function mevTax(FeeAuctionStorage.Layout storage s) internal view returns (uint24) {
    if (!s.mevTaxEnabled) return 0;

    // A transaction always pays at least the base fee. A quote made with eth_call may not
    uint256 priorityFee = tx.gasprice > block.basefee ? tx.gasprice - block.basefee : 0;
    uint256 tax = (priorityFee * s.mevTaxMultiplier) / 1e18;
    uint24 maxMevTax = s.maxMevTax;
    return tax > maxMevTax ? maxMevTax : uint24(tax);
  }
}
