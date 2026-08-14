// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '../vault/VaultMath.sol';
import '../vault/interfaces/IVaultMath.sol';

contract EchidnaVaultMath {
  uint256 private constant BALANCE_SCALE = 1e12;
  uint256 private constant Q192 = 2 ** 192;

  VaultMath private immutable vaultMath;
  int24 private immutable width;

  constructor() {
    vaultMath = new VaultMath();
    width = vaultMath.TICK_SPACING();
  }

  function checkTwoSidedPositionUsesBalances(uint24 rawTick, uint16 rawAmount0, uint16 rawAmount1) external view {
    int24 tick = _boundedTick(rawTick);
    uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
    (uint256 base0, uint256 base1) = _balancedRawAmounts(sqrtPriceX96);
    uint256 amount0 = base0 * (uint256(rawAmount0 % 1000) + 1);
    uint256 amount1 = base1 * (uint256(rawAmount1 % 1000) + 1);

    try vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1) returns (
      IVaultMath.RangePosition memory main,
      IVaultMath.RangePosition memory reserve
    ) {
      // The main position is always exactly the single tick containing the price.
      assert(main.lower == tick);
      assert(main.upper == tick + 1);
      // Something must have been minted.
      assert(main.liquidity > 0 || reserve.liquidity > 0);
      // Neither position ever overspends the supplied balances.
      assert(main.used0 + reserve.used0 <= amount0);
      assert(main.used1 + reserve.used1 <= amount1);
      // The reserve, when present, is single-sided and sits immediately outside the main tick.
      if (reserve.liquidity > 0) {
        assert((reserve.used0 == 0) != (reserve.used1 == 0));
        if (reserve.used1 == 0) {
          assert(reserve.lower == main.upper);
        } else {
          assert(reserve.upper == main.lower);
        }
        assert(reserve.upper - reserve.lower == width);
      }
      // Together, the two positions use nearly all of at least one side.
      assert(_oneSideNearlyFullyUsed(amount0, amount1, main.used0 + reserve.used0, main.used1 + reserve.used1));
    } catch {}
  }

  function checkOneSidedPositionUsesBalances(uint24 rawTick, uint16 rawAmount) external view {
    int24 tick = _boundedTick(rawTick);
    uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
    uint256 amount = (uint256(rawAmount) + 1) * BALANCE_SCALE;

    // token0-only: price sits exactly on the main tick's lower bound, so the main position
    // absorbs token0 alone; any leftover is deployed above the price as the reserve.
    try vaultMath.calculatePosition(sqrtPriceX96, amount, 0) returns (
      IVaultMath.RangePosition memory main,
      IVaultMath.RangePosition memory reserve
    ) {
      assert(main.lower == tick);
      assert(main.upper == tick + 1);
      assert(main.used1 == 0);
      assert(reserve.used1 == 0);
      uint256 totalUsed0 = main.used0 + reserve.used0;
      assert(totalUsed0 <= amount);
      assert(amount - totalUsed0 <= _dustTolerance(amount));
      if (reserve.liquidity > 0) {
        assert(reserve.lower == main.upper);
        assert(reserve.upper - reserve.lower == width);
      }
    } catch {}

    // token1-only: price sits exactly on the main tick's lower bound, which is a pure-token0
    // boundary, so the main position uses none of it and the reserve absorbs it all below the price.
    try vaultMath.calculatePosition(sqrtPriceX96, 0, amount) returns (
      IVaultMath.RangePosition memory main,
      IVaultMath.RangePosition memory reserve
    ) {
      assert(main.lower == tick);
      assert(main.upper == tick + 1);
      assert(main.liquidity == 0);
      assert(main.used0 == 0 && main.used1 == 0);
      assert(reserve.used0 == 0);
      assert(reserve.liquidity > 0);
      assert(reserve.upper == main.lower);
      assert(reserve.upper - reserve.lower == width);
      assert(amount - reserve.used1 <= _dustTolerance(amount));
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
