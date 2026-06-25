// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

interface IPriceConvergenceVaultDepositGuard {
  event DepositForwarded(address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1, uint256 shares);
  event WithdrawForwarded(address indexed sender, address indexed recipient, uint256 shares, uint256 amount0, uint256 amount1);

  error ZeroAddress();
  error InvalidRecipient();
  error InsufficientShares();
  error InsufficientAmounts();

  function deposit(uint256 amount0, uint256 amount1, uint256 minimumShares, address recipient) external returns (uint256 shares);

  function withdraw(
    uint256 shares,
    address recipient,
    uint256 minAmount0,
    uint256 minAmount1
  ) external returns (uint256 amount0, uint256 amount1);
}
