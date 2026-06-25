// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IPriceConvergenceVaultDepositGuard.sol';
import './interfaces/IPriceConvergenceVault.sol';

/// @title Price Convergence Vault Deposit Guard
/// @notice Adds minimum-output checks to deposits into and withdrawals from one immutable vault.
contract PriceConvergenceVaultDepositGuard is IPriceConvergenceVaultDepositGuard, ReentrancyGuard {
  using SafeERC20 for IERC20;

  IPriceConvergenceVault public immutable vault;
  IERC20 public immutable token0;
  IERC20 public immutable token1;

  constructor(address _vault) {
    if (_vault == address(0)) revert ZeroAddress();

    vault = IPriceConvergenceVault(_vault);
    token0 = IERC20(IPriceConvergenceVault(_vault).token0());
    token1 = IERC20(IPriceConvergenceVault(_vault).token1());
  }

  function deposit(
    uint256 amount0,
    uint256 amount1,
    uint256 minimumShares,
    address recipient
  ) external nonReentrant returns (uint256 shares) {
    if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();

    token0.safeTransferFrom(msg.sender, address(this), amount0);
    token1.safeTransferFrom(msg.sender, address(this), amount1);
    token0.forceApprove(address(vault), amount0);
    token1.forceApprove(address(vault), amount1);

    shares = vault.deposit(amount0, amount1, recipient);
    if (shares < minimumShares) revert InsufficientShares();

    emit DepositForwarded(msg.sender, recipient, amount0, amount1, shares);
  }

  function withdraw(
    uint256 shares,
    address recipient,
    uint256 minAmount0,
    uint256 minAmount1
  ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
    if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();

    IERC20(address(vault)).safeTransferFrom(msg.sender, address(this), shares);
    (amount0, amount1) = vault.withdraw(shares, recipient);
    if (amount0 < minAmount0 || amount1 < minAmount1) revert InsufficientAmounts();

    emit WithdrawForwarded(msg.sender, recipient, shares, amount0, amount1);
  }
}
