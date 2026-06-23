// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IPriceConvergenceVault {
  function rebalance(uint160 targetSqrtPriceX96) external;

  function pool() external view returns (address);

  function factory() external view returns (address);

  function token0() external view returns (address);

  function token1() external view returns (address);

  event RebalanceEntrypoint(address indexed rebalanceEntrypoint);
  event TwapPeriods(uint32 twapPeriod, uint32 auxTwapPeriod);
  event Hysteresis(uint256 hysteresis);
  event Deposit(address indexed sender, address indexed recipient, uint256 shares, uint256 amount0, uint256 amount1);
  event Withdraw(address indexed sender, address indexed recipient, uint256 shares, uint256 amount0, uint256 amount1);
  event FullRangeInitialized(int24 lower, int24 upper, uint128 liquidity);
  event Rebalance(int24 lower, int24 upper, uint128 liquidity, uint160 targetSqrtPriceX96, uint256 amount0, uint256 amount1);

  error OnlyRebalanceEntrypoint();
  error OnlyVaultManager();
  error OnlyPool();
  error InvalidFactory();
  error ZeroAddress();
  error ZeroValue();
  error InvalidPosition();
  error InvalidTwapPeriod();
  error OracleNotConnected();
  error PriceManipulation();
}
