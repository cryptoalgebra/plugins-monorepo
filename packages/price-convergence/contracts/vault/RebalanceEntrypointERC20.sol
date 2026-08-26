// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IPriceConvergenceVault.sol';
import './interfaces/IRebalanceEntrypoint.sol';

/// @title Price Convergence Rebalance Entrypoint (plain ERC20 pair)
/// @notice Converts a backend-supplied quote-per-token price directly to the pool price used by
/// the vault, for pairs where neither pool token is an ERC4626 share.
contract RebalanceEntrypointERC20 is IRebalanceEntrypoint, ReentrancyGuard {
  uint256 private constant Q96 = 2 ** 96;
  uint256 private constant Q128 = 2 ** 128;
  uint256 private constant Q192 = 2 ** 192;
  uint256 public constant PRICE_PRECISION = 1e18;
  bytes32 public constant REBALANCER_ROLE = keccak256('PRICE_CONVERGENCE_REBALANCER');
  bytes32 public constant PRICE_CONVERGENCE_VAULT_MANAGER = keccak256('PRICE_CONVERGENCE_VAULT_MANAGER');

  IPriceConvergenceVault public immutable vault;
  address public immutable factory;
  bool public immutable baseIsToken0;
  uint8 public immutable baseDecimals;
  uint8 public immutable quoteDecimals;
  address public immutable token0;
  address public immutable token1;
  address public thresholdToken;
  uint256 public rebalanceThreshold;

  modifier onlyRebalancer() {
    if (!isAuthorizedRebalancer(msg.sender)) {
      revert OnlyRebalancer();
    }
    _;
  }

  modifier onlyVaultManager() {
    if (!IAlgebraFactory(factory).hasRoleOrOwner(PRICE_CONVERGENCE_VAULT_MANAGER, msg.sender)) {
      revert OnlyVaultManager();
    }
    _;
  }

  constructor(address _vault, address _baseToken, address _thresholdToken, uint256 _rebalanceThreshold) {
    if (_vault == address(0)) revert ZeroAddress();

    vault = IPriceConvergenceVault(_vault);
    factory = IPriceConvergenceVault(_vault).factory();

    address _token0 = IPriceConvergenceVault(_vault).token0();
    address _token1 = IPriceConvergenceVault(_vault).token1();
    if (_baseToken != _token0 && _baseToken != _token1) revert InvalidBaseToken();
    baseIsToken0 = _baseToken == _token0;

    address quoteToken = _baseToken == _token0 ? _token1 : _token0;
    baseDecimals = IERC20Metadata(_baseToken).decimals();
    quoteDecimals = IERC20Metadata(quoteToken).decimals();

    token0 = _token0;
    token1 = _token1;
    if (_thresholdToken != _token0 && _thresholdToken != _token1) revert InvalidThresholdToken();
    thresholdToken = _thresholdToken;
    rebalanceThreshold = _rebalanceThreshold;
  }

  function isAuthorizedRebalancer(address account) public view override returns (bool) {
    return IAlgebraFactory(factory).hasRoleOrOwner(REBALANCER_ROLE, account);
  }

  /// @notice Converts a quote-per-baseToken price scaled by 1e18 to the pool sqrt price.
  function preview(uint256 priceX18) external view override returns (uint160 newPoolSqrtPriceX96, uint160 poolSqrtPriceX96) {
    newPoolSqrtPriceX96 = _getPoolSqrtPriceX96(priceX18);
    (poolSqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();
  }

  /// @notice True once idle vault balances, valued in thresholdToken at the pool spot price,
  /// reach rebalanceThreshold
  function shouldRebalance() external view override returns (bool) {
    uint256 balance0 = IERC20(token0).balanceOf(address(vault));
    uint256 balance1 = IERC20(token1).balanceOf(address(vault));

    (uint160 sqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();

    uint256 accumulated = thresholdToken == token0
      ? balance0 + _quoteAtSqrtPrice(sqrtPriceX96, balance1, false)
      : balance1 + _quoteAtSqrtPrice(sqrtPriceX96, balance0, true);

    return accumulated >= rebalanceThreshold;
  }

  /// @notice Updates which vault token idle balances are valued in for shouldRebalance().
  function setThresholdToken(address _thresholdToken) external onlyVaultManager {
    if (_thresholdToken != token0 && _thresholdToken != token1) revert InvalidThresholdToken();
    thresholdToken = _thresholdToken;
    emit ThresholdToken(_thresholdToken);
  }

  /// @notice Updates the accumulated-value threshold, in thresholdToken's raw units.
  function setRebalanceThreshold(uint256 _rebalanceThreshold) external onlyVaultManager {
    rebalanceThreshold = _rebalanceThreshold;
    emit RebalanceThreshold(_rebalanceThreshold);
  }

  /// @notice Rebalances the vault to a pool-native sqrt price supplied by the backend.
  function rebalance(uint160 newPoolSqrtPriceX96) external override onlyRebalancer nonReentrant {
    if (newPoolSqrtPriceX96 < TickMath.MIN_SQRT_RATIO || newPoolSqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) {
      revert InvalidPrice();
    }

    uint160 previousPoolSqrtPriceX96;
    (previousPoolSqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();
    vault.rebalance(newPoolSqrtPriceX96);

    emit Rebalance(newPoolSqrtPriceX96, previousPoolSqrtPriceX96);
  }

  function _getPoolSqrtPriceX96(uint256 priceX18) private view returns (uint160 newPoolSqrtPriceX96) {
    if (priceX18 == 0) revert InvalidPrice();

    uint256 quotePerBaseX96;
    if (quoteDecimals >= baseDecimals) {
      uint256 decimalScale = 10 ** (quoteDecimals - baseDecimals);
      quotePerBaseX96 = FullMath.mulDiv(priceX18, Q96 * decimalScale, PRICE_PRECISION);
    } else {
      uint256 decimalScale = 10 ** (baseDecimals - quoteDecimals);
      quotePerBaseX96 = FullMath.mulDiv(priceX18, Q96, PRICE_PRECISION * decimalScale);
    }
    if (quotePerBaseX96 == 0) revert InvalidPrice();

    uint256 poolPriceX96 = baseIsToken0 ? quotePerBaseX96 : FullMath.mulDiv(Q96, Q96, quotePerBaseX96);
    uint256 poolPriceX192 = FullMath.mulDiv(poolPriceX96, Q96, 1);
    uint256 sqrtPriceX96 = Math.sqrt(poolPriceX192);
    if (sqrtPriceX96 < TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) revert InvalidPrice();
    newPoolSqrtPriceX96 = uint160(sqrtPriceX96);
  }

  /// @dev zeroToOne converts a token0 amount into token1, otherwise converts token1 into token0.
  function _quoteAtSqrtPrice(uint160 sqrtPriceX96, uint256 amount, bool zeroToOne) private pure returns (uint256) {
    if (amount == 0) return 0;

    if (sqrtPriceX96 <= type(uint128).max) {
      uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
      return zeroToOne ? FullMath.mulDiv(ratioX192, amount, Q192) : FullMath.mulDiv(Q192, amount, ratioX192);
    }

    uint256 ratioX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 2 ** 64);
    return zeroToOne ? FullMath.mulDiv(ratioX128, amount, Q128) : FullMath.mulDiv(Q128, amount, ratioX128);
  }
}
