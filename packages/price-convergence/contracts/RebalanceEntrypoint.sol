// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import './interfaces/IPriceConvergenceVault.sol';
import './interfaces/IPythLazer.sol';
import './libraries/PythLazerPayload.sol';

/// @title Price Convergence Rebalance Entrypoint
/// @notice Validates Pyth Lazer prices and converts them to the pool sqrt price used by the vault.
contract RebalanceEntrypoint is Ownable, ReentrancyGuard {
  uint256 private constant Q96 = 2 ** 96;

  IPythLazer public immutable pythValidator;
  IPriceConvergenceVault public immutable vault;
  IERC4626 public immutable erc4626Vault;
  uint32 public immutable pythFeedId;
  uint32 public immutable maxPriceAge;
  bool public immutable erc4626IsToken0;
  uint8 public immutable shareDecimals;
  uint8 public immutable assetDecimals;
  uint8 public immutable quoteDecimals;

  event Rebalance(uint160 markSqrtPriceX96, uint160 poolSqrtPriceX96, uint64 pythTimestamp);

  error InvalidERC4626Vault();
  error InvalidPrice();
  error InvalidTimestamp();
  error RefundFailed();
  error ZeroAddress();

  constructor(address _pythValidator, address _vault, address _erc4626Vault, uint32 _pythFeedId, uint32 _maxPriceAge) {
    if (_pythValidator == address(0) || _vault == address(0) || _erc4626Vault == address(0)) revert ZeroAddress();
    if (_maxPriceAge == 0) revert InvalidTimestamp();

    pythValidator = IPythLazer(_pythValidator);
    vault = IPriceConvergenceVault(_vault);
    erc4626Vault = IERC4626(_erc4626Vault);
    pythFeedId = _pythFeedId;
    maxPriceAge = _maxPriceAge;

    address token0 = IPriceConvergenceVault(_vault).token0();
    address token1 = IPriceConvergenceVault(_vault).token1();
    if (_erc4626Vault != token0 && _erc4626Vault != token1) revert InvalidERC4626Vault();
    erc4626IsToken0 = _erc4626Vault == token0;

    address quoteToken = _erc4626Vault == token0 ? token1 : token0;
    address asset = IERC4626(_erc4626Vault).asset();
    shareDecimals = IERC20Metadata(_erc4626Vault).decimals();
    assetDecimals = IERC20Metadata(asset).decimals();
    quoteDecimals = IERC20Metadata(quoteToken).decimals();
    if (shareDecimals > 38 || assetDecimals > 38 || quoteDecimals > 38) revert InvalidPrice();
  }

  /// @notice Parses an already verified Pyth payload and previews the mark and current pool prices.
  function preview(bytes calldata payload) external view returns (uint160 markSqrtPriceX96, uint160 poolSqrtPriceX96) {
    PythLazerPayload.Price memory price = PythLazerPayload.parsePrice(payload, pythFeedId);
    _validatePrice(price);
    markSqrtPriceX96 = _getMarkSqrtPriceX96(price);
    (poolSqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();
  }

  /// @notice Verifies a signed Pyth update and rebalances the vault to its normalized mark price.
  function rebalance(bytes calldata update) external payable onlyOwner nonReentrant returns (uint160 markSqrtPriceX96) {
    uint256 verificationFee = pythValidator.verification_fee();
    if (msg.value < verificationFee) revert InvalidPrice();

    (bytes memory payload, ) = pythValidator.verifyUpdate{ value: verificationFee }(update);
    PythLazerPayload.Price memory price = PythLazerPayload.parsePrice(payload, pythFeedId);
    _validatePrice(price);

    markSqrtPriceX96 = _getMarkSqrtPriceX96(price);
    uint160 poolSqrtPriceX96;
    (poolSqrtPriceX96, , , , , ) = IAlgebraPool(vault.pool()).globalState();
    vault.rebalance(markSqrtPriceX96);

    uint256 refund = msg.value - verificationFee;
    if (refund != 0) {
      (bool success, ) = payable(msg.sender).call{ value: refund }('');
      if (!success) revert RefundFailed();
    }

    emit Rebalance(markSqrtPriceX96, poolSqrtPriceX96, price.timestamp);
  }

  function _validatePrice(PythLazerPayload.Price memory price) private view {
    if (price.value <= 0) revert InvalidPrice();

    uint256 timestamp = uint256(price.timestamp);
    uint256 nowMicros = block.timestamp * 1e6;
    if (timestamp > nowMicros + 1e6) revert InvalidTimestamp();
    if (timestamp < nowMicros && nowMicros - timestamp > uint256(maxPriceAge) * 1e6) revert InvalidTimestamp();
  }

  function _getMarkSqrtPriceX96(PythLazerPayload.Price memory price) private view returns (uint160 markSqrtPriceX96) {
    uint256 oneShare = 10 ** shareDecimals;
    uint256 assetsPerShare = erc4626Vault.convertToAssets(oneShare);
    if (assetsPerShare == 0) revert InvalidPrice();

    int256 decimalExponent = int256(price.exponent) + int256(uint256(quoteDecimals)) - int256(uint256(assetDecimals));
    uint256 quotePerAssetX96 = _scaleToX96(uint64(price.value), decimalExponent);
    uint256 quotePerShareX96 = FullMath.mulDiv(quotePerAssetX96, assetsPerShare, oneShare);
    if (quotePerShareX96 == 0) revert InvalidPrice();

    uint256 poolPriceX96 = erc4626IsToken0 ? quotePerShareX96 : FullMath.mulDiv(Q96, Q96, quotePerShareX96);
    uint256 poolPriceX192 = FullMath.mulDiv(poolPriceX96, Q96, 1);
    uint256 sqrtPriceX96 = Math.sqrt(poolPriceX192);
    if (sqrtPriceX96 < TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) revert InvalidPrice();
    markSqrtPriceX96 = uint160(sqrtPriceX96);
  }

  function _scaleToX96(uint64 price, int256 exponent) private pure returns (uint256 valueX96) {
    if (exponent < -38 || exponent > 38) revert InvalidPrice();
    if (exponent < 0) return FullMath.mulDiv(price, Q96, 10 ** uint256(-exponent));

    valueX96 = FullMath.mulDiv(price, Q96, 1);
    if (exponent != 0) valueX96 = FullMath.mulDiv(valueX96, 10 ** uint256(exponent), 1);
  }
}
