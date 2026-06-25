// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '../vault/VaultMath.sol';

contract EchidnaVaultMath {
  int24 private constant WIDTH = 100;
  uint256 private constant BALANCE_SCALE = 1e12;
  uint256 private constant Q192 = 2 ** 192;

  VaultMath private immutable vaultMath;

  constructor() {
    vaultMath = new VaultMath(address(this), WIDTH);
  }

  function checkTwoSidedPositionUsesBalances(uint24 rawTick, uint16 rawAmount0, uint16 rawAmount1) external view {
    int24 tick = _boundedTick(rawTick);
    uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
    (uint256 base0, uint256 base1) = _balancedRawAmounts(sqrtPriceX96);
    uint256 amount0 = base0 * (uint256(rawAmount0 % 1000) + 1);
    uint256 amount1 = base1 * (uint256(rawAmount1 % 1000) + 1);

    try vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1) returns (
      int24 lower,
      int24 upper,
      uint128 liquidity,
      uint256 used0,
      uint256 used1
    ) {
      assert(lower < tick);
      assert(tick < upper);
      assert(int256(upper) - int256(lower) == int256(WIDTH));
      assert(liquidity > 0);
      assert(used0 <= amount0);
      assert(used1 <= amount1);
      assert(_oneSideNearlyFullyUsed(amount0, amount1, used0, used1));
    } catch {}
  }

  function checkOneSidedPositionUsesBalances(uint24 rawTick, uint16 rawAmount) external view {
    int24 tick = _boundedTick(rawTick);
    uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
    uint256 amount = (uint256(rawAmount) + 1) * BALANCE_SCALE;

    try vaultMath.calculatePosition(sqrtPriceX96, amount, 0) returns (
      int24 lower,
      int24 upper,
      uint128 liquidity,
      uint256 used0,
      uint256 used1
    ) {
      assert(lower >= tick);
      assert(int256(upper) - int256(lower) == int256(WIDTH));
      assert(liquidity > 0);
      assert(used0 <= amount);
      assert(used1 == 0);
      assert(amount - used0 <= _dustTolerance(amount));
    } catch {}

    try vaultMath.calculatePosition(sqrtPriceX96, 0, amount) returns (
      int24 lower,
      int24 upper,
      uint128 liquidity,
      uint256 used0,
      uint256 used1
    ) {
      assert(upper <= tick);
      assert(int256(upper) - int256(lower) == int256(WIDTH));
      assert(liquidity > 0);
      assert(used0 == 0);
      assert(used1 <= amount);
      assert(amount - used1 <= _dustTolerance(amount));
    } catch {}
  }

  function _boundedTick(uint24 rawTick) private pure returns (int24) {
    return int24(int256(uint256(rawTick % 1_000_001)) - 500_000);
  }

  function _balancedRawAmounts(uint160 sqrtPriceX96) private pure returns (uint256 amount0, uint256 amount1) {
    uint256 priceNumerator = uint256(sqrtPriceX96) * sqrtPriceX96;
    if (priceNumerator < Q192) {
      amount0 = (Q192 * BALANCE_SCALE) / priceNumerator;
      amount1 = BALANCE_SCALE;
    } else {
      amount0 = BALANCE_SCALE;
      amount1 = (priceNumerator * BALANCE_SCALE) / Q192;
    }
  }

  function _oneSideNearlyFullyUsed(uint256 amount0, uint256 amount1, uint256 used0, uint256 used1) private pure returns (bool) {
    return amount0 - used0 <= _dustTolerance(amount0) || amount1 - used1 <= _dustTolerance(amount1);
  }

  function _dustTolerance(uint256 amount) private pure returns (uint256) {
    return amount / 1_000_000 + 10;
  }
}
