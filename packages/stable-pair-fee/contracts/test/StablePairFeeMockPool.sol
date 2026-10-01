// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;
pragma abicoder v1;

import 'test-utils/contracts/MockPool.sol';

/// @dev MockPool with a swap that takes a direction
contract StablePairFeeMockPool is MockPool {
  function swapToPrice(bool zeroToOne, uint160 targetPrice) external {
    if (globalState.pluginConfig & Plugins.BEFORE_SWAP_FLAG != 0) {
      (, overrideFee, pluginFee) = IAlgebraPlugin(plugin).beforeSwap(msg.sender, msg.sender, zeroToOne, 0, 0, false, '');
    }
    globalState.price = targetPrice;
    globalState.tick = TickMath.getTickAtSqrtRatio(targetPrice);
  }
}
