// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraMintCallback.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraSwapCallback.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IPriceConvergenceOracle.sol';
import './interfaces/IPriceConvergenceVault.sol';

/// @title Price Convergence Vault
/// @notice Draft vault that owns direct Algebra pool liquidity for the Price Convergence plugin.
contract PriceConvergenceVault is IPriceConvergenceVault, IAlgebraMintCallback, IAlgebraSwapCallback, ERC20, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  uint128 public constant MINIMUM_FULL_RANGE_LIQUIDITY = 1e6;
  uint256 public constant PRECISION = 1e18;
  uint256 public constant DEFAULT_HYSTERESIS = 5e15; // 0.5%
  uint256 private constant Q128 = 2 ** 128;
  uint256 private constant Q192 = 2 ** 192;

  struct Position {
    int24 lower;
    int24 upper;
    uint128 liquidity;
  }

  struct Prices {
    uint160 spot;
    uint160 twap;
    uint160 auxTwap;
  }

  address public immutable override pool;
  address public immutable override token0;
  address public immutable override token1;
  int24 public immutable tickSpacing;

  address public plugin;
  Position public mainPosition;
  Position public fullRangePosition;
  uint32 public twapPeriod;
  uint32 public auxTwapPeriod;
  uint256 public hysteresis;

  modifier onlyPlugin() {
    if (msg.sender != plugin) revert OnlyPlugin();
    _;
  }

  constructor(address _pool, address _plugin, uint32 _twapPeriod) ERC20('Price Convergence Vault', 'pcALM') {
    if (_pool == address(0)) revert ZeroAddress();
    if (_twapPeriod == 0) revert InvalidTwapPeriod();

    pool = _pool;
    plugin = _plugin;
    token0 = IAlgebraPool(_pool).token0();
    token1 = IAlgebraPool(_pool).token1();
    tickSpacing = IAlgebraPool(_pool).tickSpacing();
    twapPeriod = _twapPeriod;
    auxTwapPeriod = _twapPeriod / 4;
    hysteresis = DEFAULT_HYSTERESIS;
  }

  function setPlugin(address _plugin) external onlyOwner {
    plugin = _plugin;
    emit Plugin(_plugin);
  }

  function setTwapPeriods(uint32 _twapPeriod, uint32 _auxTwapPeriod) external onlyOwner {
    if (_twapPeriod == 0 || _auxTwapPeriod > _twapPeriod) revert InvalidTwapPeriod();
    twapPeriod = _twapPeriod;
    auxTwapPeriod = _auxTwapPeriod;
    emit TwapPeriods(_twapPeriod, _auxTwapPeriod);
  }

  function setHysteresis(uint256 _hysteresis) external onlyOwner {
    if (_hysteresis > PRECISION) revert ZeroValue();
    hysteresis = _hysteresis;
    emit Hysteresis(_hysteresis);
  }

  /// @notice Funds the vault with both tokens and mints fungible vault shares.
  function deposit(uint256 amount0, uint256 amount1, address recipient) external nonReentrant returns (uint256 shares) {
    if (recipient == address(0) || recipient == address(this)) revert ZeroAddress();
    if (amount0 == 0 || amount1 == 0) revert ZeroValue();

    Prices memory prices = _getValidatedPrices();
    _collectAllFees();
    shares = _calculateDepositShares(amount0, amount1, prices);
    if (shares == 0) revert ZeroValue();

    IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
    IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
    _mint(recipient, shares);

    emit Deposit(msg.sender, recipient, shares, amount0, amount1);
  }
  /// @notice Burns shares and returns a proportional share of every vault asset.
  function withdraw(uint256 shares, address recipient) external nonReentrant returns (uint256 amount0, uint256 amount1) {
    if (recipient == address(0)) revert ZeroAddress();
    if (shares == 0 || shares > balanceOf(msg.sender)) revert ZeroValue();

    uint256 supply = totalSupply();
    _collectAllFees();

    amount0 = FullMath.mulDiv(IERC20(token0).balanceOf(address(this)), shares, supply);
    amount1 = FullMath.mulDiv(IERC20(token1).balanceOf(address(this)), shares, supply);

    uint128 mainLiquidityToBurn = _proportionalLiquidity(mainPosition.liquidity, shares, supply);
    if (mainLiquidityToBurn > 0) {
      (uint256 main0, uint256 main1) = _burnPosition(mainPosition, mainLiquidityToBurn);
      amount0 += main0;
      amount1 += main1;
    }


    _burn(msg.sender, shares);
    if (amount0 > 0) IERC20(token0).safeTransfer(recipient, amount0);
    if (amount1 > 0) IERC20(token1).safeTransfer(recipient, amount1);

    emit Withdraw(msg.sender, recipient, shares, amount0, amount1);
  }
  /// @notice Adds a tiny full-range position so swaps can move price freely before the main position exists.
  function initializeFullRange() external onlyOwner nonReentrant {
    if (fullRangePosition.liquidity != 0 || totalSupply() != 0) revert InvalidPosition();

    (int24 lower, int24 upper) = _fullRangeTicks();
    (, , uint128 liquidityActual) = IAlgebraPool(pool).mint(
      address(this),
      address(this),
      lower,
      upper,
      MINIMUM_FULL_RANGE_LIQUIDITY,
      bytes('')
    );

    fullRangePosition = Position({ lower: lower, upper: upper, liquidity: liquidityActual });
    emit FullRangeInitialized(lower, upper, liquidityActual);
  }

  /// @inheritdoc IPriceConvergenceVault
  function rebalance(int256 swapQuantity, uint160 limitSqrtPrice, int24 positionWidth) external override onlyPlugin nonReentrant {
    int24 targetTick = _alignTick(TickMath.getTickAtSqrtRatio(limitSqrtPrice));

    if (mainPosition.liquidity > 0) {
      _burnPosition(mainPosition, mainPosition.liquidity);
    }

    if (swapQuantity != 0) {
      if (swapQuantity == type(int256).min) revert InvalidSwapQuantity();
      bool zeroToOne = swapQuantity > 0;
      int256 amountRequired = zeroToOne ? swapQuantity : -swapQuantity;
      IAlgebraPool(pool).swap(address(this), zeroToOne, amountRequired, limitSqrtPrice, bytes(''));
    }

    (int24 lower, int24 upper, uint128 liquidityActual, uint256 amount0, uint256 amount1) = _mintMainPosition(
      limitSqrtPrice,
      positionWidth,
      targetTick
    );
    emit Rebalance(lower, upper, liquidityActual, limitSqrtPrice, amount0, amount1);
  }

  function collectFees() external onlyOwner nonReentrant returns (uint256 fees0, uint256 fees1) {
    return _collectAllFees();
  }

  function getTotalAmounts() public view returns (uint256 total0, uint256 total1) {
    (total0, total1) = getShareholderAmounts();
    (, uint256 full0, uint256 full1) = getFullRangePosition();
    total0 += full0;
    total1 += full1;
  }

  function getShareholderAmounts() public view returns (uint256 total0, uint256 total1) {
    (, uint256 main0, uint256 main1) = getMainPosition();
    total0 = IERC20(token0).balanceOf(address(this)) + main0;
    total1 = IERC20(token1).balanceOf(address(this)) + main1;
  }

  function getMainPosition() public view returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
    return _getPositionAmounts(mainPosition);
  }

  function getFullRangePosition() public view returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
    return _getPositionAmounts(fullRangePosition);
  }

  function algebraMintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata) external override {
    if (msg.sender != pool) revert OnlyPool();
    if (amount0Owed > 0) IERC20(token0).safeTransfer(msg.sender, amount0Owed);
    if (amount1Owed > 0) IERC20(token1).safeTransfer(msg.sender, amount1Owed);
  }

  function algebraSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external override {
    if (msg.sender != pool) revert OnlyPool();
    if (amount0Delta > 0) IERC20(token0).safeTransfer(msg.sender, uint256(amount0Delta));
    if (amount1Delta > 0) IERC20(token1).safeTransfer(msg.sender, uint256(amount1Delta));
  }

  function _burnPosition(Position storage position, uint128 liquidityToBurn) private returns (uint256 amount0, uint256 amount1) {
    uint256 balance0Before = IERC20(token0).balanceOf(address(this));
    uint256 balance1Before = IERC20(token1).balanceOf(address(this));

    IAlgebraPool(pool).burn(position.lower, position.upper, liquidityToBurn, bytes(''));
    IAlgebraPool(pool).collect(address(this), position.lower, position.upper, type(uint128).max, type(uint128).max);

    amount0 = IERC20(token0).balanceOf(address(this)) - balance0Before;
    amount1 = IERC20(token1).balanceOf(address(this)) - balance1Before;
    position.liquidity -= liquidityToBurn;
    if (position.liquidity == 0) {
      position.lower = 0;
      position.upper = 0;
    }
  }

  function _collectPosition(Position memory position) private returns (uint128 fees0, uint128 fees1) {
    if (position.liquidity == 0) return (0, 0);
    IAlgebraPool(pool).burn(position.lower, position.upper, 0, bytes(''));
    (fees0, fees1) = IAlgebraPool(pool).collect(address(this), position.lower, position.upper, type(uint128).max, type(uint128).max);
  }

  function _collectAllFees() private returns (uint256 fees0, uint256 fees1) {
    (uint128 main0, uint128 main1) = _collectPosition(mainPosition);
    (uint128 full0, uint128 full1) = _collectPosition(fullRangePosition);
    fees0 = uint256(main0) + full0;
    fees1 = uint256(main1) + full1;
  }

  function _proportionalLiquidity(uint128 liquidity, uint256 shares, uint256 supply) private pure returns (uint128) {
    if (shares == supply) return liquidity;
    return uint128(FullMath.mulDiv(liquidity, shares, supply));
  }

  function _mintMainPosition(
    uint160 limitSqrtPrice,
    int24 positionWidth,
    int24 targetTick
  ) private returns (int24 lower, int24 upper, uint128 liquidityActual, uint256 amount0, uint256 amount1) {
    amount0 = IERC20(token0).balanceOf(address(this));
    amount1 = IERC20(token1).balanceOf(address(this));
    (lower, upper) = _calculatePositionTicks(targetTick, positionWidth, amount0, amount1, limitSqrtPrice);

    (uint160 currentSqrtPrice, , , , , ) = IAlgebraPool(pool).globalState();
    uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
      currentSqrtPrice,
      TickMath.getSqrtRatioAtTick(lower),
      TickMath.getSqrtRatioAtTick(upper),
      amount0,
      amount1
    );
    if (liquidity == 0) revert ZeroValue();

    (, , liquidityActual) = IAlgebraPool(pool).mint(address(this), address(this), lower, upper, liquidity, bytes(''));
    mainPosition = Position({ lower: lower, upper: upper, liquidity: liquidityActual });
  }

  function _getPositionAmounts(Position memory position) private view returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
    if (position.liquidity == 0) return (0, 0, 0);

    bytes32 key = _positionKey(address(this), position.lower, position.upper);
    (uint256 rawLiquidity, , , uint128 fees0, uint128 fees1) = IAlgebraPool(pool).positions(key);
    liquidity = uint128(rawLiquidity);

    (uint160 sqrtPrice, , , , , ) = IAlgebraPool(pool).globalState();
    (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
      sqrtPrice,
      TickMath.getSqrtRatioAtTick(position.lower),
      TickMath.getSqrtRatioAtTick(position.upper),
      liquidity
    );

    amount0 += fees0;
    amount1 += fees1;
  }

  function _calculatePositionTicks(
    int24 targetTick,
    int24 positionWidth,
    uint256 amount0,
    uint256 amount1,
    uint160 limitSqrtPrice
  ) private view returns (int24 lower, int24 upper) {
    (int24 minTick, int24 maxTick) = _fullRangeTicks();
    int24 width = _normalizeWidth(positionWidth);
    int24 fullWidth = maxTick - minTick;
    if (width >= fullWidth) return (minTick, maxTick);

    uint256 value0 = _quoteAtSqrtPrice(limitSqrtPrice, amount0, true);
    uint256 totalValue = value0 + amount1;
    if (totalValue == 0) revert ZeroValue();

    int24 steps = width / tickSpacing;
    uint256 stepsBelow = FullMath.mulDiv(uint256(uint24(steps)), amount1, totalValue);
    if (stepsBelow > uint256(uint24(steps))) stepsBelow = uint256(uint24(steps));

    lower = targetTick - int24(uint24(stepsBelow)) * tickSpacing;
    upper = lower + width;

    if (lower < minTick) {
      upper += minTick - lower;
      lower = minTick;
    }
    if (upper > maxTick) {
      lower -= upper - maxTick;
      upper = maxTick;
    }
    if (lower >= upper) revert InvalidPosition();
  }

  function _normalizeWidth(int24 width) private view returns (int24 normalizedWidth) {
    if (width <= 0) revert InvalidPosition();

    int24 steps = width / tickSpacing;
    if (width % tickSpacing != 0) steps += 1;
    if (steps <= 0) steps = 1;
    normalizedWidth = steps * tickSpacing;
  }

  function _alignTick(int24 tick) private view returns (int24 alignedTick) {
    int24 compressed = tick / tickSpacing;
    if (tick < 0 && tick % tickSpacing != 0) compressed -= 1;
    alignedTick = compressed * tickSpacing;

    (int24 minTick, int24 maxTick) = _fullRangeTicks();
    if (alignedTick < minTick) return minTick;
    if (alignedTick > maxTick) return maxTick;
  }

  function _fullRangeTicks() private view returns (int24 lower, int24 upper) {
    lower = (TickMath.MIN_TICK / tickSpacing) * tickSpacing;
    upper = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;
  }

  function _calculateDepositShares(uint256 amount0, uint256 amount1, Prices memory prices) private view returns (uint256 shares) {
    uint160 depositPrice = _minPrice(prices);
    shares = _valueInToken1(amount0, amount1, depositPrice);

    uint256 supply = totalSupply();
    if (supply == 0) return shares;

    (uint256 total0, uint256 total1) = getShareholderAmounts();
    uint256 totalValue = _valueInToken1(total0, total1, _maxPrice(prices));
    if (totalValue == 0) revert ZeroValue();
    shares = FullMath.mulDiv(shares, supply, totalValue);
  }

  function _getValidatedPrices() private view returns (Prices memory prices) {
    IAlgebraPool algebraPool = IAlgebraPool(pool);
    uint8 pluginConfig;
    bool unlocked;
    (prices.spot, , , pluginConfig, , unlocked) = algebraPool.globalState();
    if (!unlocked) revert PriceManipulation();

    address oracle = algebraPool.plugin();
    if (oracle == address(0) || oracle != plugin || !Plugins.hasFlag(pluginConfig, Plugins.BEFORE_SWAP_FLAG)) {
      revert OracleNotConnected();
    }

    prices.twap = TickMath.getSqrtRatioAtTick(_consult(oracle, twapPeriod));
    prices.auxTwap = auxTwapPeriod == 0 ? prices.twap : TickMath.getSqrtRatioAtTick(_consult(oracle, auxTwapPeriod));
    _checkPriceManipulation(oracle, prices);
  }

  function _consult(address oracle, uint32 period) private view returns (int24 averageTick) {
    if (period == 0) revert InvalidTwapPeriod();

    uint32[] memory secondsAgos = new uint32[](2);
    secondsAgos[0] = period;
    (int56[] memory tickCumulatives, ) = IPriceConvergenceOracle(oracle).getTimepoints(secondsAgos);
    int56 delta = tickCumulatives[1] - tickCumulatives[0];
    int56 periodInt = int56(uint56(period));
    averageTick = int24(delta / periodInt);
    if (delta < 0 && delta % periodInt != 0) averageTick--;
  }

  function _checkPriceManipulation(address oracle, Prices memory prices) private view {
    uint256 spot = _quoteAtSqrtPrice(prices.spot, PRECISION, true);
    uint256 twap = _quoteAtSqrtPrice(prices.twap, PRECISION, true);
    uint256 auxTwap = _quoteAtSqrtPrice(prices.auxTwap, PRECISION, true);

    if (_relativeDelta(spot, twap) > hysteresis || _relativeDelta(spot, auxTwap) > hysteresis) {
      if (IPriceConvergenceOracle(oracle).lastTimepointTimestamp() == uint32(block.timestamp)) revert PriceManipulation();
    }
  }

  function _relativeDelta(uint256 a, uint256 b) private pure returns (uint256) {
    if (a == b) return 0;
    uint256 denominator = a > b ? a : b;
    if (denominator == 0) return PRECISION;
    uint256 difference = a > b ? a - b : b - a;
    return FullMath.mulDiv(difference, PRECISION, denominator);
  }

  function _minPrice(Prices memory prices) private pure returns (uint160 price) {
    price = prices.spot < prices.twap ? prices.spot : prices.twap;
    if (prices.auxTwap < price) price = prices.auxTwap;
  }

  function _maxPrice(Prices memory prices) private pure returns (uint160 price) {
    price = prices.spot > prices.twap ? prices.spot : prices.twap;
    if (prices.auxTwap > price) price = prices.auxTwap;
  }
  function _valueInToken1(uint256 amount0, uint256 amount1, uint160 sqrtPrice) private pure returns (uint256) {
    return _quoteAtSqrtPrice(sqrtPrice, amount0, true) + amount1;
  }

  function _quoteAtSqrtPrice(uint160 sqrtPrice, uint256 amount, bool zeroToOne) private pure returns (uint256) {
    if (amount == 0) return 0;

    if (sqrtPrice <= type(uint128).max) {
      uint256 ratioX192 = uint256(sqrtPrice) * sqrtPrice;
      return zeroToOne ? FullMath.mulDiv(ratioX192, amount, Q192) : FullMath.mulDiv(Q192, amount, ratioX192);
    }

    uint256 ratioX128 = FullMath.mulDiv(sqrtPrice, sqrtPrice, 2 ** 64);
    return zeroToOne ? FullMath.mulDiv(ratioX128, amount, Q128) : FullMath.mulDiv(Q128, amount, ratioX128);
  }

  function _positionKey(address positionOwner, int24 lower, int24 upper) private pure returns (bytes32 key) {
    assembly {
      key := or(shl(24, or(shl(24, positionOwner), and(lower, 0xFFFFFF))), and(upper, 0xFFFFFF))
    }
  }
}
