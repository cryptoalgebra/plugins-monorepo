// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraMintCallback.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraSwapCallback.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@cryptoalgebra/integral-periphery/contracts/libraries/LiquidityAmounts.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './interfaces/IPriceConvergenceOracle.sol';
import './interfaces/IPriceConvergenceVault.sol';
import './interfaces/IVaultMath.sol';

/// @title Price Convergence Vault
/// @notice Owns direct Algebra pool liquidity for the Price Convergence strategy.
contract PriceConvergenceVault is IPriceConvergenceVault, IAlgebraMintCallback, IAlgebraSwapCallback, ERC20, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  int24 public constant TICK_SPACING = 1;
  uint256 public constant PRECISION = 1e18;
  uint256 public constant MIN_SHARES = 1e6;
  uint256 public constant DEFAULT_HYSTERESIS = 5e15; // 0.5%
  bytes32 public constant PRICE_CONVERGENCE_VAULT_MANAGER = keccak256('PRICE_CONVERGENCE_VAULT_MANAGER');
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
  address public immutable override factory;
  address public immutable override token0;
  address public immutable override token1;
  address public immutable deployer;
  uint128 public immutable fullRangeLiquidity;
  
  IVaultMath public vaultMath;
  address public rebalanceEntrypoint;
  Position public mainPosition;
  Position public reservePosition;
  bool public fullRangeInitialized;
  uint32 public twapPeriod;
  uint32 public auxTwapPeriod;
  uint256 public hysteresis;

  modifier onlyRebalanceEntrypoint() {
    if (msg.sender != rebalanceEntrypoint) revert OnlyRebalanceEntrypoint();
    _;
  }

  modifier onlyVaultManager() {
    _checkVaultManager();
    _;
  }

  constructor(
    address _pool,
    address _factory,
    uint128 _fullRangeLiquidity,
    address _vaultMath,
    uint32 _twapPeriod
  ) ERC20('Price Convergence Vault', 'pcALM') {
    if (_pool == address(0) || _factory == address(0) || _vaultMath == address(0)) revert ZeroAddress();
    if (_fullRangeLiquidity == 0) revert ZeroValue();
    if (_twapPeriod == 0) revert InvalidTwapPeriod();
    if (IAlgebraPool(_pool).factory() != _factory) revert InvalidFactory();

    pool = _pool;
    factory = _factory;
    deployer = msg.sender;
    token0 = IAlgebraPool(_pool).token0();
    token1 = IAlgebraPool(_pool).token1();
    fullRangeLiquidity = _fullRangeLiquidity;
    vaultMath = IVaultMath(_vaultMath);
    twapPeriod = _twapPeriod;
    auxTwapPeriod = _twapPeriod / 4;
    hysteresis = DEFAULT_HYSTERESIS;
  }

  /// @notice Sets the entrypoint allowed to call rebalance.
  /// @dev While the entrypoint is unset, the deployer can set it once without role
  function setRebalanceEntrypoint(address _rebalanceEntrypoint) external {
    if (rebalanceEntrypoint != address(0) || msg.sender != deployer) _checkVaultManager();
    if (_rebalanceEntrypoint == address(0)) revert ZeroAddress();
    rebalanceEntrypoint = _rebalanceEntrypoint;
    emit RebalanceEntrypoint(_rebalanceEntrypoint);
  }

  function setVaultMath(address _vaultMath) external onlyVaultManager {
    if (_vaultMath == address(0)) revert ZeroAddress();
    vaultMath = IVaultMath(_vaultMath);
    emit VaultMath(_vaultMath);
  }

  function pause() external onlyVaultManager {
    _pause();
  }

  function unpause() external onlyVaultManager {
    _unpause();
  }

  function setTwapPeriods(uint32 _twapPeriod, uint32 _auxTwapPeriod) external onlyVaultManager {
    if (_twapPeriod == 0 || _auxTwapPeriod > _twapPeriod) revert InvalidTwapPeriod();
    twapPeriod = _twapPeriod;
    auxTwapPeriod = _auxTwapPeriod;
    emit TwapPeriods(_twapPeriod, _auxTwapPeriod);
  }

  function setHysteresis(uint256 _hysteresis) external onlyVaultManager {
    if (_hysteresis > PRECISION) revert ZeroValue();
    hysteresis = _hysteresis;
    emit Hysteresis(_hysteresis);
  }

  /// @notice Funds the vault with one or both tokens and mints fungible vault shares.
  /// @dev The bootstrapping deposit that seeds the full-range position must supply both tokens.
  function deposit(
    uint256 amount0,
    uint256 amount1,
    address recipient
  ) external override whenNotPaused nonReentrant returns (uint256 shares) {
    if (recipient == address(0) || recipient == address(this)) revert ZeroAddress();
    if (amount0 == 0 && amount1 == 0) revert ZeroValue();

    Prices memory prices = _getValidatedPrices();
    if (mainPosition.liquidity != 0 || reservePosition.liquidity != 0) _collectAllFees();
    shares = _calculateDepositShares(amount0, amount1, prices);
    if (shares == 0) revert ZeroValue();

    if (amount0 > 0) IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
    if (amount1 > 0) IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);
    _mint(recipient, shares);

    // A single-sided bootstrap cannot pay the second side owed by the full-range mint, so this
    // reverts inside the callback. No explicit guard: the mint enforces the two-sided requirement.
    if (!fullRangeInitialized) _initializeFullRange();

    emit Deposit(msg.sender, recipient, shares, amount0, amount1);
  }
  /// @notice Burns shares and returns a proportional share of every vault asset.
  function withdraw(uint256 shares, address recipient) external override nonReentrant returns (uint256 amount0, uint256 amount1) {
    if (recipient == address(0)) revert ZeroAddress();
    if (shares == 0 || shares > balanceOf(msg.sender)) revert ZeroValue();

    uint256 supply = totalSupply();
    if (shares != supply && supply - shares < MIN_SHARES) revert InvalidShares();

    // Burn the caller's proportional share of the main and reserve positions
    uint128 mainLiquidityToBurn = shares == supply
      ? mainPosition.liquidity
      : uint128(FullMath.mulDiv(mainPosition.liquidity, shares, supply));
    uint128 reserveLiquidityToBurn = shares == supply
      ? reservePosition.liquidity
      : uint128(FullMath.mulDiv(reservePosition.liquidity, shares, supply));
    if (mainLiquidityToBurn > 0 || reserveLiquidityToBurn > 0) _collectAllFees();

    amount0 = FullMath.mulDiv(IERC20(token0).balanceOf(address(this)), shares, supply);
    amount1 = FullMath.mulDiv(IERC20(token1).balanceOf(address(this)), shares, supply);

    if (mainLiquidityToBurn > 0) {
      (uint256 main0, uint256 main1) = _burnPosition(mainPosition, mainLiquidityToBurn);
      amount0 += main0;
      amount1 += main1;
    }
    if (reserveLiquidityToBurn > 0) {
      (uint256 reserve0, uint256 reserve1) = _burnPosition(reservePosition, reserveLiquidityToBurn);
      amount0 += reserve0;
      amount1 += reserve1;
    }

    _burn(msg.sender, shares);
    if (amount0 > 0) IERC20(token0).safeTransfer(recipient, amount0);
    if (amount1 > 0) IERC20(token1).safeTransfer(recipient, amount1);

    emit Withdraw(msg.sender, recipient, shares, amount0, amount1);
  }

  /// @inheritdoc IPriceConvergenceVault
  function rebalance(uint160 targetSqrtPriceX96) external override onlyRebalanceEntrypoint whenNotPaused nonReentrant {
    if (targetSqrtPriceX96 < TickMath.MIN_SQRT_RATIO || targetSqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) {
      revert InvalidPosition();
    }
    if (mainPosition.liquidity > 0) _burnPosition(mainPosition, mainPosition.liquidity);
    if (reservePosition.liquidity > 0) _burnPosition(reservePosition, reservePosition.liquidity);

    (uint160 currentSqrtPriceX96, , , , , ) = IAlgebraPool(pool).globalState();
    if (currentSqrtPriceX96 != targetSqrtPriceX96) {
      bool zeroToOne = currentSqrtPriceX96 > targetSqrtPriceX96;
      IAlgebraPool(pool).swap(address(this), zeroToOne, type(int256).max, targetSqrtPriceX96, bytes(''));
      (currentSqrtPriceX96, , , , , ) = IAlgebraPool(pool).globalState();
    }

    (uint256 amount0, uint256 amount1) = _mintPositions(currentSqrtPriceX96);
    emit Rebalance(
      mainPosition.lower,
      mainPosition.upper,
      mainPosition.liquidity,
      reservePosition.lower,
      reservePosition.upper,
      reservePosition.liquidity,
      targetSqrtPriceX96,
      amount0,
      amount1
    );
  }

  function collectFees() external onlyVaultManager nonReentrant returns (uint256 fees0, uint256 fees1) {
    return _collectAllFees();
  }

  function getTotalAmounts() public view returns (uint256 total0, uint256 total1) {
    return getShareholderAmounts();
  }

  function getShareholderAmounts() public view returns (uint256 total0, uint256 total1) {
    (, uint256 main0, uint256 main1) = getMainPosition();
    (, uint256 reserve0, uint256 reserve1) = getReservePosition();
    total0 = IERC20(token0).balanceOf(address(this)) + main0 + reserve0;
    total1 = IERC20(token1).balanceOf(address(this)) + main1 + reserve1;
  }

  function getMainPosition() public view returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
    return _getPositionAmounts(mainPosition);
  }

  function getReservePosition() public view returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
    return _getPositionAmounts(reservePosition);
  }

  function algebraMintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata) external override {
    if (msg.sender != pool) revert OnlyPool();
    if (amount0Owed > 0) IERC20(token0).safeTransfer(msg.sender, amount0Owed);
    if (amount1Owed > 0) IERC20(token1).safeTransfer(msg.sender, amount1Owed);
  }

  function algebraSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external override {
    if (msg.sender != pool) revert OnlyPool();
    if (amount0Delta > 0) _paySwap(token0, uint256(amount0Delta));
    if (amount1Delta > 0) _paySwap(token1, uint256(amount1Delta));
  }

  function _checkVaultManager() private view {
    if (!IAlgebraFactory(factory).hasRoleOrOwner(PRICE_CONVERGENCE_VAULT_MANAGER, msg.sender)) {
      revert OnlyVaultManager();
    }
  }

  function _paySwap(address token, uint256 amount) private {
    uint256 balance = IERC20(token).balanceOf(address(this));
    if (balance >= amount) {
      IERC20(token).safeTransfer(pool, amount);
      return;
    }

    IERC20(token).safeTransferFrom(tx.origin, pool, amount);
  }

  function _initializeFullRange() private {
    fullRangeInitialized = true;

    (, , uint128 liquidityActual) = IAlgebraPool(pool).mint(
      address(this),
      address(this),
      TickMath.MIN_TICK,
      TickMath.MAX_TICK,
      fullRangeLiquidity,
      bytes('')
    );

    (uint256 vaultBalance0, uint256 vaultBalance1) = getShareholderAmounts();
    if (vaultBalance0 == 0 && vaultBalance1 == 0) revert ZeroValue();

    emit FullRangeInitialized(TickMath.MIN_TICK, TickMath.MAX_TICK, liquidityActual);
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
    (uint128 reserve0, uint128 reserve1) = _collectPosition(reservePosition);
    fees0 = uint256(main0) + uint256(reserve0);
    fees1 = uint256(main1) + uint256(reserve1);
  }

  /// @dev Mints the single-tick main position and, if vaultMath planned one, the single-sided
  /// reserve position that absorbs whichever token the main position could not use.
  function _mintPositions(uint160 currentSqrtPriceX96) private returns (uint256 amount0, uint256 amount1) {
    uint256 balance0 = IERC20(token0).balanceOf(address(this));
    uint256 balance1 = IERC20(token1).balanceOf(address(this));

    (IVaultMath.RangePosition memory main, IVaultMath.RangePosition memory reserve) = vaultMath.calculatePosition(
      currentSqrtPriceX96,
      balance0,
      balance1
    );

    if (main.liquidity > 0) {
      (uint256 main0, uint256 main1, uint128 liquidityActual) = IAlgebraPool(pool).mint(
        address(this),
        address(this),
        main.lower,
        main.upper,
        main.liquidity,
        bytes('')
      );
      mainPosition = Position({ lower: main.lower, upper: main.upper, liquidity: liquidityActual });
      amount0 += main0;
      amount1 += main1;
    }

    if (reserve.liquidity > 0) {
      (uint256 reserve0, uint256 reserve1, uint128 liquidityActual) = IAlgebraPool(pool).mint(
        address(this),
        address(this),
        reserve.lower,
        reserve.upper,
        reserve.liquidity,
        bytes('')
      );
      reservePosition = Position({ lower: reserve.lower, upper: reserve.upper, liquidity: liquidityActual });
      amount0 += reserve0;
      amount1 += reserve1;
    }
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


  function _calculateDepositShares(uint256 amount0, uint256 amount1, Prices memory prices) private view returns (uint256 shares) {
    // Value the deposit in token1 at the lowest of the three prices
    uint160 depositPrice = prices.spot < prices.twap ? prices.spot : prices.twap;
    if (prices.auxTwap < depositPrice) depositPrice = prices.auxTwap;
    shares = _quoteAtSqrtPrice(depositPrice, amount0, true) + amount1;

    uint256 supply = totalSupply();
    if (supply == 0) return shares * MIN_SHARES;

    // Value existing holdings at the highest of the three prices
    uint160 totalPrice = prices.spot > prices.twap ? prices.spot : prices.twap;
    if (prices.auxTwap > totalPrice) totalPrice = prices.auxTwap;
    (uint256 total0, uint256 total1) = getShareholderAmounts();
    uint256 totalValue = _quoteAtSqrtPrice(totalPrice, total0, true) + total1;
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
    if (oracle == address(0) || !Plugins.hasFlag(pluginConfig, Plugins.BEFORE_SWAP_FLAG)) {
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

  /// @dev internal (not private) so PriceConvergenceVaultQuoteHelper can expose it for direct testing
  function _quoteAtSqrtPrice(uint160 sqrtPrice, uint256 amount, bool zeroToOne) internal pure returns (uint256) {
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
