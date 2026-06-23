// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

/// @title Price Convergence Vault Math
/// @notice Stores the configurable main position width and calculates vault rebalance parameters.
contract VaultMath {
  int24 public constant TICK_SPACING = 1;
  bytes32 public constant PRICE_CONVERGENCE_VAULT_MANAGER = keccak256('PRICE_CONVERGENCE_VAULT_MANAGER');

  uint256 private constant Q64 = 2 ** 64;
  uint256 private constant Q128 = 2 ** 128;
  uint256 private constant Q192 = 2 ** 192;

  address public immutable factory;
  int24 public positionWidth;

  event PositionWidth(int24 positionWidth);

  error InvalidPositionWidth();
  error InvalidPosition();
  error OnlyVaultManager();
  error RatioOverflow();
  error ZeroAddress();
  error ZeroAmounts();

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
  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (int24 lower, int24 upper, uint128 liquidity, uint256 used0, uint256 used1) {
    if (amount0 == 0 && amount1 == 0) revert ZeroAmounts();

    int24 width = positionWidth;
    int24 currentTick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);

    if (amount1 == 0) {
      lower = _ceilTickAtPrice(currentTick, sqrtPriceX96);
      upper = lower + width;
      if (upper > TickMath.MAX_TICK) revert InvalidPosition();
      return _positionAtTicks(sqrtPriceX96, amount0, 0, lower, upper);
    }

    if (amount0 == 0) {
      upper = currentTick;
      lower = upper - width;
      if (lower < TickMath.MIN_TICK) revert InvalidPosition();
      return _positionAtTicks(sqrtPriceX96, 0, amount1, lower, upper);
    }

    int24 minLower = currentTick - width + TICK_SPACING;
    if (minLower < TickMath.MIN_TICK) minLower = TickMath.MIN_TICK;

    int24 maxLower = currentTick;
    if (TickMath.getSqrtRatioAtTick(currentTick) == sqrtPriceX96) maxLower -= TICK_SPACING;

    int24 maxLowerByRange = TickMath.MAX_TICK - width;
    if (maxLower > maxLowerByRange) maxLower = maxLowerByRange;
    if (minLower > maxLower) revert InvalidPosition();

    int24 idealLower = _idealLowerTick(sqrtPriceX96, amount0, amount1, width);
    if (idealLower < minLower) idealLower = minLower;
    if (idealLower > maxLower) idealLower = maxLower;
    return _bestCandidate(sqrtPriceX96, amount0, amount1, width, minLower, maxLower, idealLower);
  }

  function _idealLowerTick(uint160 sqrtPriceX96, uint256 amount0, uint256 amount1, int24 width) private pure returns (int24 lowerTick) {
    uint256 priceX64 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, Q128);
    if (priceX64 == 0) revert RatioOverflow();
    uint256 valueRatioX64 = FullMath.mulDiv(amount0, priceX64, amount1);
    uint256 qX64 = uint256(TickMath.getSqrtRatioAtTick(width)) >> 32;
    uint256 qvX64 = FullMath.mulDiv(qX64, valueRatioX64, Q64);

    uint256 coefficient;
    bool negativeCoefficient = valueRatioX64 < Q64;
    if (negativeCoefficient) coefficient = FullMath.mulDiv(qX64, Q64 - valueRatioX64, Q64);
    else coefficient = FullMath.mulDiv(qX64, valueRatioX64 - Q64, Q64);

    if (coefficient != 0 && coefficient > type(uint256).max / coefficient) revert RatioOverflow();
    uint256 discriminant = coefficient * coefficient;
    if (qvX64 > type(uint256).max / (4 * Q64)) revert RatioOverflow();
    uint256 qvTerm = 4 * qvX64 * Q64;
    if (discriminant > type(uint256).max - qvTerm) revert RatioOverflow();
    discriminant += qvTerm;

    uint256 sqrtDiscriminant = Math.sqrt(discriminant);
    uint256 zX64;
    if (negativeCoefficient) {
      zX64 = (sqrtDiscriminant + coefficient) / 2;
    } else {
      zX64 = FullMath.mulDiv(qvX64, 2 * Q64, sqrtDiscriminant + coefficient);
    }
    if (zX64 == 0) revert InvalidPosition();

    uint256 sqrtLowerX96 = FullMath.mulDiv(sqrtPriceX96, Q64, zX64);
    if (sqrtLowerX96 < TickMath.MIN_SQRT_RATIO) return TickMath.MIN_TICK;
    if (sqrtLowerX96 >= TickMath.MAX_SQRT_RATIO) return TickMath.MAX_TICK;
    lowerTick = TickMath.getTickAtSqrtRatio(uint160(sqrtLowerX96));
  }

  function _bestCandidate(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 width,
    int24 minLower,
    int24 maxLower,
    int24 idealLower
  ) private pure returns (int24 lower, int24 upper, uint128 liquidity, uint256 used0, uint256 used1) {
    uint256 bestUsedValue;

    for (int24 offset = -2; offset <= 2; ++offset) {
      int24 candidateLower = idealLower + offset * TICK_SPACING;
      if (candidateLower < minLower || candidateLower > maxLower) continue;

      int24 candidateUpper = candidateLower + width;
      (, , uint128 candidateLiquidity, uint256 candidateUsed0, uint256 candidateUsed1) = _positionAtTicks(
        sqrtPriceX96,
        amount0,
        amount1,
        candidateLower,
        candidateUpper
      );
      uint256 usedValue = _quoteAtSqrtPrice(sqrtPriceX96, candidateUsed0) + candidateUsed1;

      if (usedValue > bestUsedValue) {
        bestUsedValue = usedValue;
        lower = candidateLower;
        upper = candidateUpper;
        liquidity = candidateLiquidity;
        used0 = candidateUsed0;
        used1 = candidateUsed1;
      }
    }

    if (liquidity == 0) revert InvalidPosition();
  }

  function _positionAtTicks(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 lower,
    int24 upper
  ) private pure returns (int24, int24, uint128 liquidity, uint256 used0, uint256 used1) {
    uint160 sqrtLowerX96 = TickMath.getSqrtRatioAtTick(lower);
    uint160 sqrtUpperX96 = TickMath.getSqrtRatioAtTick(upper);
    liquidity = LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, amount0, amount1);
    (used0, used1) = LiquidityAmounts.getAmountsForLiquidity(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, liquidity);
    return (lower, upper, liquidity, used0, used1);
  }

  function _ceilTickAtPrice(int24 currentTick, uint160 sqrtPriceX96) private pure returns (int24 tick) {
    tick = currentTick;
    if (TickMath.getSqrtRatioAtTick(currentTick) < sqrtPriceX96) tick += TICK_SPACING;
  }

  function _quoteAtSqrtPrice(uint160 sqrtPriceX96, uint256 amount0) private pure returns (uint256) {
    if (sqrtPriceX96 <= type(uint128).max) {
      uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
      return FullMath.mulDiv(ratioX192, amount0, Q192);
    }

    uint256 ratioX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 2 ** 64);
    return FullMath.mulDiv(ratioX128, amount0, Q128);
  }

  function _setPositionWidth(int24 _positionWidth) private {
    if (_positionWidth <= 0 || _positionWidth > TickMath.MAX_TICK) revert InvalidPositionWidth();
    positionWidth = _positionWidth;
    emit PositionWidth(_positionWidth);
  }
}
