// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IRebalanceEntrypoint {
  event Rebalance(uint160 newPoolSqrtPriceX96, uint160 previousPoolSqrtPriceX96);

  error InvalidERC4626Vault();
  error InvalidPrice();
  error OnlyRebalancer();
  error ZeroAddress();

  function isAuthorizedRebalancer(address account) external view returns (bool);

  function preview(uint256 priceX18) external view returns (uint160 newPoolSqrtPriceX96, uint160 poolSqrtPriceX96);

  function rebalance(uint160 newPoolSqrtPriceX96) external;
}
