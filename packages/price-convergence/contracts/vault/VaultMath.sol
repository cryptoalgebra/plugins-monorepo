// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IVaultMath.sol';

/// @title Price Convergence Vault Math
/// @notice Stores the configurable main position width and calculates vault rebalance parameters.
contract VaultMath is IVaultMath {
  /// @dev Price Convergence pools use unit tick spacing, so every integer tick is initializable.
  int24 public constant TICK_SPACING = 1;
  bytes32 public constant PRICE_CONVERGENCE_VAULT_MANAGER = keccak256('PRICE_CONVERGENCE_VAULT_MANAGER');

  /// @dev q, v and z use Q64.64. With the maximum supported width, q can approach 2^64;
  /// keeping 64 fractional bits allows q^2, used by the discriminant, to remain within uint256.
  uint256 private constant Q64 = 2 ** 64;
  /// @dev Pool price and reciprocal pool price use Q128.128. Unlike Q64.64, this format
  /// remains non-zero throughout the full TickMath price range [2^-128, 2^128].
  uint256 private constant Q128 = 2 ** 128;
  /// @dev A Q64.96 sqrt price squared is a Q128.192 price.
  uint256 private constant Q192 = 2 ** 192;

  address public immutable factory;
  int24 public positionWidth;

  modifier onlyVaultManager() {
    if (!IAlgebraFactory(factory).hasRoleOrOwner(PRICE_CONVERGENCE_VAULT_MANAGER, msg.sender)) {
      revert OnlyVaultManager();
    }
    _;
  }

  constructor(address _factory, int24 _positionWidth) {
    if (_factory == address(0)) revert ZeroAddress();
    factory = _factory;
    _setPositionWidth(_positionWidth);
  }

  function setPositionWidth(int24 _positionWidth) external onlyVaultManager {
    _setPositionWidth(_positionWidth);
  }

  /// @notice Calculates the snapped range and maximum liquidity for the vault token balances.
  /// @dev amount0 and amount1 are raw token units. No decimal normalization is required because
  /// sqrtPriceX96 also represents token1/token0 in raw units.
  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (int24 lower, int24 upper, uint128 liquidity, uint256 used0, uint256 used1) {
    if (amount0 == 0 && amount1 == 0) revert ZeroAmounts();

    int24 width = positionWidth;
    int24 currentTick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);

    // With only token0, the complete range must be at or above the current price.
    // LiquidityAmounts then uses its token0-only branch.
    if (amount1 == 0) {
      lower = _ceilTickAtPrice(currentTick, sqrtPriceX96);
      upper = lower + width;
      if (upper > TickMath.MAX_TICK) revert InvalidPosition();
      (liquidity, used0, used1) = _liquidityAndUsedAmounts(sqrtPriceX96, amount0, 0, lower, upper);
      return (lower, upper, liquidity, used0, used1);
    }

    // With only token1, the complete range must be at or below the current price.
    // currentTick is floor(log_1.0001(price)), so it is a valid upper boundary.
    if (amount0 == 0) {
      upper = currentTick;
      lower = upper - width;
      if (lower < TickMath.MIN_TICK) revert InvalidPosition();
      (liquidity, used0, used1) = _liquidityAndUsedAmounts(sqrtPriceX96, 0, amount1, lower, upper);
      return (lower, upper, liquidity, used0, used1);
    }

    return _calculateTwoSidedPosition(sqrtPriceX96, amount0, amount1, width, currentTick);
  }

  function _calculateTwoSidedPosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 width,
    int24 currentTick
  ) private pure returns (int24 lower, int24 upper, uint128 liquidity, uint256 used0, uint256 used1) {
    // Bounds for every lower tick that keeps the current price strictly inside a fixed-width range.
    int24 minLower = currentTick - width + TICK_SPACING;
    if (minLower < TickMath.MIN_TICK) minLower = TickMath.MIN_TICK;

    int24 maxLower = currentTick;
    if (TickMath.getSqrtRatioAtTick(currentTick) == sqrtPriceX96) maxLower -= TICK_SPACING;

    int24 maxLowerByRange = TickMath.MAX_TICK - width;
    if (maxLower > maxLowerByRange) maxLower = maxLowerByRange;
    if (minLower > maxLower) revert InvalidPosition();

    lower = _idealLowerTick(sqrtPriceX96, amount0, amount1, width);
    if (lower < minLower) lower = minLower;
    if (lower > maxLower) lower = maxLower;

    // The candidate window steps one tick beyond the strictly-inside bounds
    int24 candidateMin = minLower - TICK_SPACING;
    if (candidateMin < TickMath.MIN_TICK) candidateMin = TickMath.MIN_TICK;
    int24 candidateMax = maxLower + TICK_SPACING;
    if (candidateMax > maxLowerByRange) candidateMax = maxLowerByRange;

    (lower, liquidity) = _bestLowerTick(sqrtPriceX96, amount0, amount1, width, lower, candidateMin, candidateMax);
    if (liquidity == 0) revert InvalidPosition();

    upper = lower + width;

    if (lower > currentTick + TICK_SPACING || upper < currentTick) revert InvalidPosition();
    (used0, used1) = LiquidityAmounts.getAmountsForLiquidity(
      sqrtPriceX96,
      TickMath.getSqrtRatioAtTick(lower),
      TickMath.getSqrtRatioAtTick(upper),
      liquidity
    );
  }

  /// @dev Compares the floored solution with its neighbours and keeps the most liquid range
  function _bestLowerTick(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 width,
    int24 idealLower,
    int24 candidateMin,
    int24 candidateMax
  ) private pure returns (int24 bestLower, uint128 bestLiquidity) {
    bestLower = idealLower;
    bestLiquidity = _liquidityForRange(sqrtPriceX96, amount0, amount1, idealLower, idealLower + width);

    int24 candidate = idealLower - TICK_SPACING;
    if (candidate >= candidateMin) {
      uint128 candidateLiquidity = _liquidityForRange(sqrtPriceX96, amount0, amount1, candidate, candidate + width);
      if (candidateLiquidity > bestLiquidity) (bestLower, bestLiquidity) = (candidate, candidateLiquidity);
    }

    candidate = idealLower + TICK_SPACING;
    if (candidate <= candidateMax) {
      uint128 candidateLiquidity = _liquidityForRange(sqrtPriceX96, amount0, amount1, candidate, candidate + width);
      if (candidateLiquidity > bestLiquidity) (bestLower, bestLiquidity) = (candidate, candidateLiquidity);
    }
  }

  /// @dev LiquidityAmounts.getLiquidityForAmounts handles every price-range configuration
  function _liquidityForRange(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 lower,
    int24 upper
  ) private pure returns (uint128) {
    return
      LiquidityAmounts.getLiquidityForAmounts(
        sqrtPriceX96,
        TickMath.getSqrtRatioAtTick(lower),
        TickMath.getSqrtRatioAtTick(upper),
        amount0,
        amount1
      );
  }

  /// @dev Solves the continuous fixed-width placement.
  ///
  /// Let s be the current sqrt price, a the lower sqrt price and b the upper sqrt price.
  /// For fixed width W:
  ///   q = b / a = 1.0001^(W / 2)
  ///   z = s / a, where 1 < z < q
  ///   v = amount0 * s^2 / amount1
  ///
  /// Equating the token0 and token1 liquidity formulas gives:
  ///   z^2 + q(v - 1)z - qv = 0.
  ///
  /// The pool price is kept in Q128.128 so it cannot round to zero near MIN_SQRT_RATIO.
  /// q and z remain Q64.64 because their squared discriminant must fit in uint256.
  function _idealLowerTick(uint160 sqrtPriceX96, uint256 amount0, uint256 amount1, int24 width) private pure returns (int24 lowerTick) {
    // Sx96^2 / 2^64 = P * 2^128. This is non-zero for every valid TickMath sqrt price.
    uint256 priceX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, Q64);
    if (priceX128 == 0) revert RatioOverflow();

    // TickMath(width) is exactly q in Q64.96. Dropping 32 fractional bits converts it to Q64.64.
    uint256 qX64 = uint256(TickMath.getSqrtRatioAtTick(width)) >> 32;
    uint256 zX64;

    // Compare amount0 * P with amount1 using exact 512-bit products. Calculating v directly
    // before this branch could overflow when token0 dominates by a very large factor.
    if (_lteProduct(amount0, priceX128, amount1, Q128)) {
      // v <= 1, so v * 2^128 fits in uint256. Convert it to Q64.64 for the root calculation.
      uint256 valueRatioX128 = FullMath.mulDiv(amount0, priceX128, amount1);
      zX64 = _solveZAtMostOne(qX64, valueRatioX128 >> 64);
    } else {
      // For v > 1, solve the equivalent equation in u = 1 / v:
      //   u*z^2 + q(1-u)z - q = 0.
      // This keeps the represented ratio in [0, 1] even when v itself is too large for uint256.
      uint256 reciprocalSqrtPriceX96 = Q192 / sqrtPriceX96;
      uint256 inversePriceX128 = FullMath.mulDiv(reciprocalSqrtPriceX96, reciprocalSqrtPriceX96, Q64);
      uint256 inverseValueRatioX128 = FullMath.mulDiv(amount1, inversePriceX128, amount0);
      zX64 = _solveZAboveOne(qX64, inverseValueRatioX128 >> 64);
    }
    if (zX64 == 0) revert InvalidPosition();

    // a = s / z. Both operands retain their original scaling after multiplying by Q64.
    uint256 sqrtLowerX96 = FullMath.mulDiv(sqrtPriceX96, Q64, zX64);
    // Clamping here lets calculatePosition clamp the corresponding tick to the valid in-range bounds.
    if (sqrtLowerX96 < TickMath.MIN_SQRT_RATIO) return TickMath.MIN_TICK;
    if (sqrtLowerX96 >= TickMath.MAX_SQRT_RATIO) return TickMath.MAX_TICK;
    // getTickAtSqrtRatio rounds toward negative infinity, i.e. returns floor(idealLowerTick).
    lowerTick = TickMath.getTickAtSqrtRatio(uint160(sqrtLowerX96));
  }

  /// @dev Positive quadratic root for v <= 1:
  /// z = (q(1-v) + sqrt(q^2(1-v)^2 + 4qv)) / 2.
  function _solveZAtMostOne(uint256 qX64, uint256 valueRatioX64) private pure returns (uint256 zX64) {
    uint256 qvX64 = FullMath.mulDiv(qX64, valueRatioX64, Q64);
    uint256 coefficientX64 = FullMath.mulDiv(qX64, Q64 - valueRatioX64, Q64);
    uint256 sqrtDiscriminantX64 = _sqrtDiscriminant(coefficientX64, qvX64);
    zX64 = (sqrtDiscriminantX64 + coefficientX64) / 2;
  }

  /// @dev Positive quadratic root expressed through u = 1/v for v > 1:
  /// z = 2q / (sqrt(q^2(1-u)^2 + 4qu) + q(1-u)).
  /// The rationalized form avoids subtracting two nearly equal values when token0 dominates.
  function _solveZAboveOne(uint256 qX64, uint256 inverseValueRatioX64) private pure returns (uint256 zX64) {
    uint256 quX64 = FullMath.mulDiv(qX64, inverseValueRatioX64, Q64);
    uint256 coefficientX64 = FullMath.mulDiv(qX64, Q64 - inverseValueRatioX64, Q64);
    uint256 sqrtDiscriminantX64 = _sqrtDiscriminant(coefficientX64, quX64);
    zX64 = FullMath.mulDiv(qX64, 2 * Q64, sqrtDiscriminantX64 + coefficientX64);
  }

  /// @dev Returns sqrt(coefficient^2 + 4*q*ratio) in Q64.64 and gives explicit
  /// RatioOverflow errors instead of arithmetic panic codes at unsupported extreme combinations.
  function _sqrtDiscriminant(uint256 coefficientX64, uint256 qRatioX64) private pure returns (uint256) {
    if (coefficientX64 != 0 && coefficientX64 > type(uint256).max / coefficientX64) revert RatioOverflow();
    uint256 discriminantX128 = coefficientX64 * coefficientX64;

    if (qRatioX64 > type(uint256).max / (4 * Q64)) revert RatioOverflow();
    uint256 ratioTermX128 = 4 * qRatioX64 * Q64;
    if (discriminantX128 > type(uint256).max - ratioTermX128) revert RatioOverflow();

    return Math.sqrt(discriminantX128 + ratioTermX128);
  }

  /// @dev Compares a*b <= c*d without truncation and without requiring either 512-bit product
  /// to fit in uint256. FullMath uses the same mulmod technique to recover high product limbs.
  function _lteProduct(uint256 a, uint256 b, uint256 c, uint256 d) private pure returns (bool) {
    uint256 abLow;
    uint256 abHigh;
    uint256 cdLow;
    uint256 cdHigh;
    assembly {
      let modulus := not(0)
      let abMod := mulmod(a, b, modulus)
      abLow := mul(a, b)
      abHigh := sub(sub(abMod, abLow), lt(abMod, abLow))

      let cdMod := mulmod(c, d, modulus)
      cdLow := mul(c, d)
      cdHigh := sub(sub(cdMod, cdLow), lt(cdMod, cdLow))
    }
    return abHigh < cdHigh || (abHigh == cdHigh && abLow <= cdLow);
  }

  function _ceilTickAtPrice(int24 currentTick, uint160 sqrtPriceX96) private pure returns (int24 tick) {
    tick = currentTick;
    // getTickAtSqrtRatio returns floor. Move one tick up unless the price is exactly on the tick.
    if (TickMath.getSqrtRatioAtTick(currentTick) < sqrtPriceX96) tick += TICK_SPACING;
  }

  function _liquidityAndUsedAmounts(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 lower,
    int24 upper
  ) private pure returns (uint128 liquidity, uint256 used0, uint256 used1) {
    uint160 sqrtLowerX96 = TickMath.getSqrtRatioAtTick(lower);
    uint160 sqrtUpperX96 = TickMath.getSqrtRatioAtTick(upper);
    liquidity = LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, amount0, amount1);
    if (liquidity == 0) revert InvalidPosition();
    (used0, used1) = LiquidityAmounts.getAmountsForLiquidity(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, liquidity);
  }

  function _setPositionWidth(int24 _positionWidth) private {
    // With tick spacing 1 every positive integer width is initializable. MAX_TICK also keeps
    // TickMath.getSqrtRatioAtTick(width), used to obtain q, inside its supported domain.
    if (_positionWidth <= 0 || _positionWidth > TickMath.MAX_TICK) revert InvalidPositionWidth();
    positionWidth = _positionWidth;
    emit PositionWidth(_positionWidth);
  }
}
