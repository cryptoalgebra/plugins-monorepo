// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

contract MockRebalanceVault {
  address public immutable factory;
  address public immutable pool;
  address public immutable token0;
  address public immutable token1;

  uint160 public lastTargetSqrtPriceX96;
  address public lastRebalanceCaller;

  constructor(address _factory, address _pool, address _token0, address _token1) {
    factory = _factory;
    pool = _pool;
    token0 = _token0;
    token1 = _token1;
  }

  function rebalance(uint160 targetSqrtPriceX96) external {
    lastTargetSqrtPriceX96 = targetSqrtPriceX96;
    lastRebalanceCaller = msg.sender;
  }
}
