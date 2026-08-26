// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IRebalanceEntrypoint {
  event Rebalance(uint160 newPoolSqrtPriceX96, uint160 previousPoolSqrtPriceX96);
  event ThresholdToken(address indexed thresholdToken);
  event RebalanceThreshold(uint256 rebalanceThreshold);

  error InvalidBaseToken();
  error InvalidERC4626Vault();
  error InvalidPrice();
  error InvalidThresholdToken();
  error OnlyRebalancer();
  error OnlyVaultManager();
  error ZeroAddress();

  function isAuthorizedRebalancer(address account) external view returns (bool);

  function preview(uint256 priceX18) external view returns (uint160 newPoolSqrtPriceX96, uint160 poolSqrtPriceX96);

  function rebalance(uint160 newPoolSqrtPriceX96) external;

  /// @notice Whether idle vault balances, valued in the threshold token at the pool spot
  /// price, have accumulated past the configured rebalance threshold.
  function shouldRebalance() external view returns (bool);

  /// @notice Updates which vault token idle balances are valued in for shouldRebalance().
  /// @dev Must be token0 or token1 of the vault.
  function setThresholdToken(address _thresholdToken) external;

  /// @notice Updates the accumulated-value threshold, in thresholdToken's raw units.
  function setRebalanceThreshold(uint256 _rebalanceThreshold) external;
}
