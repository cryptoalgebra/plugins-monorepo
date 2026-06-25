// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../vault/RebalanceEntrypoint.sol';

contract EchidnaEntrypointToken {
  uint8 private immutable _decimals;

  constructor(uint8 decimals_) {
    _decimals = decimals_;
  }

  function decimals() external view returns (uint8) {
    return _decimals;
  }
}

contract EchidnaEntrypointERC4626 is EchidnaEntrypointToken {
  address private immutable _asset;
  uint256 private immutable _assetsPerShare;

  constructor(address asset_, uint8 shareDecimals_, uint256 assetsPerShare_) EchidnaEntrypointToken(shareDecimals_) {
    _asset = asset_;
    _assetsPerShare = assetsPerShare_;
  }

  function asset() external view returns (address) {
    return _asset;
  }

  function convertToAssets(uint256) external view returns (uint256) {
    return _assetsPerShare;
  }
}

contract EchidnaEntrypointPool {
  function globalState()
    external
    pure
    returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)
  {
    return (uint160(2 ** 96), 0, 0, 0, 0, true);
  }
}

contract EchidnaEntrypointVault {
  address public immutable factory;
  address public immutable pool;
  address public immutable token0;
  address public immutable token1;

  constructor(address factory_, address pool_, address token0_, address token1_) {
    factory = factory_;
    pool = pool_;
    token0 = token0_;
    token1 = token1_;
  }

  function rebalance(uint160) external pure {}
}

contract EchidnaRebalanceEntrypoint {
  uint256 private constant Q96 = 2 ** 96;
  uint256 private constant PRICE_PRECISION = 1e18;

  address private constant FACTORY = address(0x1000);

  function checkSquarePricesAcrossDecimals(uint8 rawAssetDecimals, uint8 rawShareQuoteDecimals, uint8 rawMultiplierExp) external {
    uint8 assetDecimals = rawAssetDecimals % 19;
    uint8 shareQuoteDecimals = rawShareQuoteDecimals % 19;
    uint256 multiplier = 2 ** (rawMultiplierExp % 20);
    uint256 priceX18 = multiplier * multiplier * PRICE_PRECISION;

    assert(_preview(assetDecimals, shareQuoteDecimals, shareQuoteDecimals, 10 ** assetDecimals, priceX18, true) == multiplier * Q96);
    assert(_preview(assetDecimals, shareQuoteDecimals, shareQuoteDecimals, 10 ** assetDecimals, priceX18, false) == Q96 / multiplier);
  }

  function checkAssetDecimalsDoNotChangeEconomicPrice(
    uint8 rawAssetDecimalsA,
    uint8 rawAssetDecimalsB,
    uint8 rawShareDecimals,
    uint16 rawAssetsPerShare,
    uint16 rawPrice,
    bool shareIsToken0
  ) external {
    uint8 assetDecimalsA = rawAssetDecimalsA % 19;
    uint8 assetDecimalsB = rawAssetDecimalsB % 19;
    uint8 shareDecimals = rawShareDecimals % 19;
    uint256 humanAssetsPerShare = uint256(rawAssetsPerShare % 10_000) + 1;
    uint256 priceX18 = uint256((rawPrice % 10_000) + 1) * PRICE_PRECISION;

    uint160 targetA = _preview(assetDecimalsA, shareDecimals, 18, humanAssetsPerShare * 10 ** assetDecimalsA, priceX18, shareIsToken0);
    uint160 targetB = _preview(assetDecimalsB, shareDecimals, 18, humanAssetsPerShare * 10 ** assetDecimalsB, priceX18, shareIsToken0);

    assert(targetA == targetB);
  }

  function checkPriceMonotonicity(
    uint8 rawAssetDecimals,
    uint8 rawShareDecimals,
    uint8 rawQuoteDecimals,
    uint16 rawAssetsPerShare,
    uint24 rawPriceA,
    uint24 rawPriceB
  ) external {
    uint8 assetDecimals = rawAssetDecimals % 19;
    uint8 shareDecimals = rawShareDecimals % 19;
    uint8 quoteDecimals = rawQuoteDecimals % 19;
    uint256 assetsPerShare = (uint256(rawAssetsPerShare % 10_000) + 1) * 10 ** assetDecimals;
    uint256 priceA = (uint256(rawPriceA % 1_000_000) + 1) * 1e12;
    uint256 priceB = (uint256(rawPriceB % 1_000_000) + 1) * 1e12;

    if (priceA == priceB) return;
    if (priceA > priceB) (priceA, priceB) = (priceB, priceA);

    (bool validToken0A, uint160 token0A) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, priceA, true);
    (bool validToken0B, uint160 token0B) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, priceB, true);
    if (validToken0A && validToken0B) assert(token0A < token0B);

    (bool validToken1A, uint160 token1A) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, priceA, false);
    (bool validToken1B, uint160 token1B) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, priceB, false);
    if (validToken1A && validToken1B) assert(token1A > token1B);
  }

  function checkAssetsPerShareMonotonicity(
    uint8 rawAssetDecimals,
    uint8 rawShareDecimals,
    uint8 rawQuoteDecimals,
    uint16 rawAssetsPerShareA,
    uint16 rawAssetsPerShareB,
    uint24 rawPrice
  ) external {
    uint8 assetDecimals = rawAssetDecimals % 19;
    uint8 shareDecimals = rawShareDecimals % 19;
    uint8 quoteDecimals = rawQuoteDecimals % 19;
    uint256 assetsPerShareA = (uint256(rawAssetsPerShareA % 10_000) + 1) * 10 ** assetDecimals;
    uint256 assetsPerShareB = (uint256(rawAssetsPerShareB % 10_000) + 1) * 10 ** assetDecimals;
    uint256 priceX18 = (uint256(rawPrice % 1_000_000) + 1) * 1e12;

    if (assetsPerShareA == assetsPerShareB) return;
    if (assetsPerShareA > assetsPerShareB) (assetsPerShareA, assetsPerShareB) = (assetsPerShareB, assetsPerShareA);

    (bool validToken0A, uint160 token0A) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShareA, priceX18, true);
    (bool validToken0B, uint160 token0B) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShareB, priceX18, true);
    if (validToken0A && validToken0B) assert(token0A < token0B);

    (bool validToken1A, uint160 token1A) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShareA, priceX18, false);
    (bool validToken1B, uint160 token1B) = _tryPreview(assetDecimals, shareDecimals, quoteDecimals, assetsPerShareB, priceX18, false);
    if (validToken1A && validToken1B) assert(token1A > token1B);
  }

  function _preview(
    uint8 assetDecimals,
    uint8 shareDecimals,
    uint8 quoteDecimals,
    uint256 assetsPerShare,
    uint256 priceX18,
    bool shareIsToken0
  ) private returns (uint160 target) {
    RebalanceEntrypoint entrypoint = _deployEntrypoint(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, shareIsToken0);
    (target, ) = entrypoint.preview(priceX18);
  }

  function _tryPreview(
    uint8 assetDecimals,
    uint8 shareDecimals,
    uint8 quoteDecimals,
    uint256 assetsPerShare,
    uint256 priceX18,
    bool shareIsToken0
  ) private returns (bool valid, uint160 target) {
    RebalanceEntrypoint entrypoint = _deployEntrypoint(assetDecimals, shareDecimals, quoteDecimals, assetsPerShare, shareIsToken0);

    try entrypoint.preview(priceX18) returns (uint160 newPoolSqrtPriceX96, uint160) {
      return (true, newPoolSqrtPriceX96);
    } catch {
      return (false, 0);
    }
  }

  function _deployEntrypoint(
    uint8 assetDecimals,
    uint8 shareDecimals,
    uint8 quoteDecimals,
    uint256 assetsPerShare,
    bool shareIsToken0
  ) private returns (RebalanceEntrypoint entrypoint) {
    EchidnaEntrypointToken asset = new EchidnaEntrypointToken(assetDecimals);
    EchidnaEntrypointERC4626 share = new EchidnaEntrypointERC4626(address(asset), shareDecimals, assetsPerShare);
    EchidnaEntrypointToken quote = new EchidnaEntrypointToken(quoteDecimals);
    EchidnaEntrypointPool pool = new EchidnaEntrypointPool();
    address token0 = shareIsToken0 ? address(share) : address(quote);
    address token1 = shareIsToken0 ? address(quote) : address(share);
    EchidnaEntrypointVault vault = new EchidnaEntrypointVault(FACTORY, address(pool), token0, token1);

    entrypoint = new RebalanceEntrypoint(address(vault), address(share));
  }
}
