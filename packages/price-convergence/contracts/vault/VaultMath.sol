// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';
import './interfaces/IVaultMath.sol';

/// @title Price Convergence Vault Math
/// @notice Stores the configurable reserve position width and calculates vault rebalance parameters.
contract VaultMath is IVaultMath {
  /// @dev Price Convergence pools use unit tick spacing, so every integer tick is initializable.
  int24 public constant TICK_SPACING = 1;
  bytes32 public constant PRICE_CONVERGENCE_VAULT_MANAGER = keccak256('PRICE_CONVERGENCE_VAULT_MANAGER');

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

  /// @notice Calculates the single-tick main position around the current price and, if one
  /// token remains after funding it, the single-sided reserve position that absorbs it.
  /// @dev amount0 and amount1 are raw token units. No decimal normalization is required because
  /// sqrtPriceX96 also represents token1/token0 in raw units.
  function calculatePosition(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1
  ) external view returns (RangePosition memory mainPosition, RangePosition memory reservePosition) {
    if (amount0 == 0 && amount1 == 0) revert ZeroAmounts();

    int24 lower = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
    int24 upper = lower + TICK_SPACING;
    if (upper > TickMath.MAX_TICK) revert InvalidPosition();
    mainPosition = _positionForAmounts(sqrtPriceX96, amount0, amount1, lower, upper);

    uint256 leftover0 = amount0 - mainPosition.used0;
    uint256 leftover1 = amount1 - mainPosition.used1;
    int24 width = positionWidth;

    // Whichever token the main position could not fully use is deployed single-sided,
    // immediately outside the main tick: token0 above the price, token1 below it.
    if (leftover0 > 0) {
      int24 reserveUpper = mainPosition.upper + width;
      if (reserveUpper > TickMath.MAX_TICK) revert InvalidPosition();
      reservePosition = _positionForAmounts(sqrtPriceX96, leftover0, 0, mainPosition.upper, reserveUpper);
    } else if (leftover1 > 0) {
      int24 reserveLower = mainPosition.lower - width;
      if (reserveLower < TickMath.MIN_TICK) revert InvalidPosition();
      reservePosition = _positionForAmounts(sqrtPriceX96, 0, leftover1, reserveLower, mainPosition.lower);
    }

    if (mainPosition.liquidity == 0 && reservePosition.liquidity == 0) revert InvalidPosition();
  }

  /// @dev Never reverts on zero liquidity: callers decide whether an empty position is fatal.
  function _positionForAmounts(
    uint160 sqrtPriceX96,
    uint256 amount0,
    uint256 amount1,
    int24 lower,
    int24 upper
  ) private pure returns (RangePosition memory position) {
    uint160 sqrtLowerX96 = TickMath.getSqrtRatioAtTick(lower);
    uint160 sqrtUpperX96 = TickMath.getSqrtRatioAtTick(upper);
    uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, amount0, amount1);

    (uint256 used0, uint256 used1) = liquidity == 0
      ? (uint256(0), uint256(0))
      : LiquidityAmounts.getAmountsForLiquidity(sqrtPriceX96, sqrtLowerX96, sqrtUpperX96, liquidity);

    position = RangePosition({ lower: lower, upper: upper, liquidity: liquidity, used0: used0, used1: used1 });
  }

  function _setPositionWidth(int24 _positionWidth) private {
    // With tick spacing 1 every positive integer width is initializable. MAX_TICK also keeps
    // the reserve range's opposite bound inside TickMath's supported domain.
    if (_positionWidth <= 0 || _positionWidth > TickMath.MAX_TICK) revert InvalidPositionWidth();
    positionWidth = _positionWidth;
    emit PositionWidth(_positionWidth);
  }
}
