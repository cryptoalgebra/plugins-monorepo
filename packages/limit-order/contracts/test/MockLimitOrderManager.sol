// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock LimitOrderManager for testing
/// @notice Tracks afterSwap calls for verification in tests
contract MockLimitOrderManager {
  struct SwapCall {
    address pool;
    bool zeroToOne;
    int24 tick;
  }

  SwapCall[] public swapCalls;

  function afterSwap(address pool, bool zeroToOne, int24 tick) external {
    swapCalls.push(SwapCall({ pool: pool, zeroToOne: zeroToOne, tick: tick }));
  }

  function getSwapCallsCount() external view returns (uint256) {
    return swapCalls.length;
  }

  function getLastSwapCall() external view returns (address pool, bool zeroToOne, int24 tick) {
    require(swapCalls.length > 0, 'No swap calls');
    SwapCall memory lastCall = swapCalls[swapCalls.length - 1];
    return (lastCall.pool, lastCall.zeroToOne, lastCall.tick);
  }

  function clearSwapCalls() external {
    delete swapCalls;
  }
}
