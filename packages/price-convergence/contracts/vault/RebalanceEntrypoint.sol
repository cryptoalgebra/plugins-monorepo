// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IPriceConvergenceVault.sol';
import './interfaces/IRebalanceEntrypoint.sol';

/// @title Price Convergence Rebalance Entrypoint
/// @notice Converts a backend-supplied underlying asset price to the pool price used by the vault.
contract RebalanceEntrypoint is IRebalanceEntrypoint, ReentrancyGuard {
  uint256 private constant Q96 = 2 ** 96;
  uint256 public constant PRICE_PRECISION = 1e18;
  bytes32 public constant REBALANCER_ROLE = keccak256('PRICE_CONVERGENCE_REBALANCER');

  IPriceConvergenceVault public immutable vault;
  address public immutable factory;
  IERC4626 public immutable erc4626Vault;
  bool public immutable erc4626IsToken0;
  uint8 public immutable shareDecimals;
  uint8 public immutable assetDecimals;
  uint8 public immutable quoteDecimals;

  modifier onlyRebalancer() {
    if (!isAuthorizedRebalancer(msg.sender)) {
      revert OnlyRebalancer();
    }
    _;
  }

  constructor(address _vault, address _erc4626Vault) {
    if (_vault == address(0) || _erc4626Vault == address(0)) revert ZeroAddress();

    vault = IPriceConvergenceVault(_vault);
    factory = IPriceConvergenceVault(_vault).factory();
    erc4626Vault = IERC4626(_erc4626Vault);

    address token0 = IPriceConvergenceVault(_vault).token0();
    address token1 = IPriceConvergenceVault(_vault).token1();
    if (_erc4626Vault != token0 && _erc4626Vault != token1) revert InvalidERC4626Vault();
    erc4626IsToken0 = _erc4626Vault == token0;

    address quoteToken = _erc4626Vault == token0 ? token1 : token0;
    address asset = IERC4626(_erc4626Vault).asset();
    shareDecimals = IERC20Metadata(_erc4626Vault).decimals();
    assetDecimals = IERC20Metadata(asset).decimals();
    quoteDecimals = IERC20Metadata(quoteToken).decimals();
  }

  function isAuthorizedRebalancer(address account) public view override returns (bool) {
    return IAlgebraFactory(factory).hasRoleOrOwner(REBALANCER_ROLE, account);
  }

  /// @notice Converts a quote-per-underlying-asset price scaled by 1e18 to the pool sqrt price.
  function preview(uint256 priceX18) external view override returns (uint160 newPoolSqrtPriceX96, uint160 poolSqrtPriceX96) {
    newPoolSqrtPriceX96 = _getPoolSqrtPriceX96(priceX18);
    (poolSqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();
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

    uint256 quotePerAssetX96;
    if (quoteDecimals >= assetDecimals) {
      uint256 decimalScale = 10 ** (quoteDecimals - assetDecimals);
      quotePerAssetX96 = FullMath.mulDiv(priceX18, Q96 * decimalScale, PRICE_PRECISION);
    } else {
      uint256 decimalScale = 10 ** (assetDecimals - quoteDecimals);
      quotePerAssetX96 = FullMath.mulDiv(priceX18, Q96, PRICE_PRECISION * decimalScale);
    }
    if (quotePerAssetX96 == 0) revert InvalidPrice();

    uint256 oneShare = 10 ** shareDecimals;
    uint256 assetsPerShare = erc4626Vault.convertToAssets(oneShare);
    if (assetsPerShare == 0) revert InvalidPrice();

    uint256 quotePerShareX96 = FullMath.mulDiv(quotePerAssetX96, assetsPerShare, oneShare);
    if (quotePerShareX96 == 0) revert InvalidPrice();

    uint256 poolPriceX96 = erc4626IsToken0 ? quotePerShareX96 : FullMath.mulDiv(Q96, Q96, quotePerShareX96);
    uint256 poolPriceX192 = FullMath.mulDiv(poolPriceX96, Q96, 1);
    uint256 sqrtPriceX96 = Math.sqrt(poolPriceX192);
    if (sqrtPriceX96 < TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) revert InvalidPrice();
    newPoolSqrtPriceX96 = uint160(sqrtPriceX96);
  }
}
