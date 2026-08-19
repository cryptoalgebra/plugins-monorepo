// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../vault/PriceConvergenceVault.sol';

/// @dev Exposes PriceConvergenceVault's internal _quoteAtSqrtPrice for direct unit testing,
/// without routing through the full deposit/mint flow.
contract PriceConvergenceVaultQuoteHelper is PriceConvergenceVault {
  constructor(
    address _pool,
    address _factory,
    uint128 _fullRangeLiquidity,
    address _vaultMath,
    uint32 _twapPeriod
  ) PriceConvergenceVault(_pool, _factory, _fullRangeLiquidity, _vaultMath, _twapPeriod) {}

  function quoteAtSqrtPrice(uint160 sqrtPrice, uint256 amount, bool zeroToOne) external pure returns (uint256) {
    return _quoteAtSqrtPrice(sqrtPrice, amount, zeroToOne);
  }
}
