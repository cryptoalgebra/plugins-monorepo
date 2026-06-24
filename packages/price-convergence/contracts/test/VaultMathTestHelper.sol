// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';

contract VaultMathTestHelper {
  function getSqrtRatioAtTick(int24 tick) external pure returns (uint160) {
    return TickMath.getSqrtRatioAtTick(tick);
  }
}
