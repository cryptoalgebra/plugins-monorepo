// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolImmutables.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/callback/IAlgebraMintCallback.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol';

// One shared contract for every pool, keyed by pool address; only each pool's registered plugin may call in.
// KNOWN GAP: balanceOf(this) reads below are aggregate across pools, need per-pool erc20/shares counters.
// KNOWN GAP: setDistribution has no JIT-in-progress lock yet, needed before onBeforeSwap/onAfterSwap go live.
contract DualPoolManager is IAlgebraMintCallback {
  using SafeERC20 for IERC20;

  error OnlyFactory();
  error OnlyPlugin();
  error PluginAlreadySet();
  error AlreadyInitialized();
  error VaultAssetMismatch();
  error VaultChargesEntryFee();
  error VaultChargesExitFee();
  error ZeroSharesMinted();
  error InvalidCallback();
  error InvalidDistribution();
  error InvalidTickRange();

  uint256 internal constant MAX_BUCKETS = 8;
  uint256 internal constant TOTAL_WEIGHT_BPS = 10_000;

  struct LiquidityBucket {
    int24 tickLower;
    int24 tickUpper;
    uint16 weightBps;
  }

  struct PoolState {
    address plugin;
    address token0;
    address token1;
    IERC4626 vault0;
    IERC4626 vault1;
    bool initialized;
    LiquidityBucket[] buckets;
    mapping(uint256 bucketIndex => uint128 liquidity) activeLiquidity;
  }

  address public immutable factory;
  mapping(address pool => PoolState) internal poolState;

  modifier onlyPoolPlugin(address pool) {
    if (msg.sender != poolState[pool].plugin) revert OnlyPlugin();
    _;
  }

  constructor() {
    factory = msg.sender;
  }

  function setPlugin(address pool, address plugin) external {
    if (msg.sender != factory) revert OnlyFactory();
    PoolState storage s = poolState[pool];
    if (s.plugin != address(0)) revert PluginAlreadySet();

    s.plugin = plugin;
    s.token0 = IAlgebraPoolImmutables(pool).token0();
    s.token1 = IAlgebraPoolImmutables(pool).token1();
  }

  function initializeDualPool(address pool, address vault0, address vault1) external onlyPoolPlugin(pool) {
    PoolState storage s = poolState[pool];
    if (s.initialized) revert AlreadyInitialized();

    if (vault0 != address(0)) {
      if (IERC4626(vault0).asset() != s.token0) revert VaultAssetMismatch();
      _requireFeelessVault(IERC4626(vault0));
      IERC20(s.token0).forceApprove(vault0, type(uint256).max);
    }
    if (vault1 != address(0)) {
      if (IERC4626(vault1).asset() != s.token1) revert VaultAssetMismatch();
      _requireFeelessVault(IERC4626(vault1));
      IERC20(s.token1).forceApprove(vault1, type(uint256).max);
    }

    s.vault0 = IERC4626(vault0);
    s.vault1 = IERC4626(vault1);
    s.initialized = true;
  }

  // weights must sum to 10_000; ticks must be aligned to the pool's CURRENT tickSpacing (Algebra's is mutable, unlike v4's)
  function setDistribution(address pool, LiquidityBucket[] calldata buckets) external onlyPoolPlugin(pool) {
    uint256 n = buckets.length;
    if (n == 0 || n > MAX_BUCKETS) revert InvalidDistribution();

    int24 tickSpacing = IAlgebraPoolState(pool).tickSpacing();
    uint256 totalWeight;
    for (uint256 i; i < n; ++i) {
      LiquidityBucket calldata b = buckets[i];
      if (b.tickLower >= b.tickUpper) revert InvalidTickRange();
      if (b.tickLower < TickMath.MIN_TICK || b.tickUpper > TickMath.MAX_TICK) revert InvalidTickRange();
      if (b.tickLower % tickSpacing != 0 || b.tickUpper % tickSpacing != 0) revert InvalidTickRange();
      if (b.weightBps == 0) revert InvalidDistribution();
      totalWeight += b.weightBps;
    }
    if (totalWeight != TOTAL_WEIGHT_BPS) revert InvalidDistribution();

    PoolState storage s = poolState[pool];
    delete s.buckets;
    for (uint256 i; i < n; ++i) {
      s.buckets.push(buckets[i]);
    }
  }

  function getDistribution(address pool) external view returns (LiquidityBucket[] memory) {
    return poolState[pool].buckets;
  }

  function depositToVault(address pool, bool isToken0, uint256 amount) external onlyPoolPlugin(pool) {
    if (amount == 0) return;
    PoolState storage s = poolState[pool];
    IERC4626 vault = isToken0 ? s.vault0 : s.vault1;
    if (address(vault) == address(0)) return;

    address asset = vault.asset();
    if (IERC20(asset).allowance(address(this), address(vault)) < amount) {
      IERC20(asset).forceApprove(address(vault), type(uint256).max);
    }
    if (vault.deposit(amount, address(this)) == 0) revert ZeroSharesMinted();
  }

  function withdrawFromVault(address pool, bool isToken0, uint256 amount) external onlyPoolPlugin(pool) {
    if (amount == 0) return;
    PoolState storage s = poolState[pool];
    IERC4626 vault = isToken0 ? s.vault0 : s.vault1;
    if (address(vault) == address(0)) return;

    vault.withdraw(amount, address(this), address(this));
  }

  function onBeforeSwap(address pool, bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice) external onlyPoolPlugin(pool) {
    // TODO: gate on a per-pool `live` flag, flipped true by bootstrap() once it exists
    // JIT deploy — loop buckets, computeAllocations, _mintPosition, _storeActiveLiquidity — added next
  }

  function onAfterSwap(address pool, bool zeroToOne, int256 amount0, int256 amount1) external onlyPoolPlugin(pool) {
    // JIT teardown — loop buckets, _takeActiveLiquidity, _burnPosition, _collectPosition — added next
  }

  /// @inheritdoc IAlgebraMintCallback
  function algebraMintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external override {
    address pool = abi.decode(data, (address));
    PoolState storage s = poolState[pool];
    if (msg.sender != pool || s.plugin == address(0)) revert InvalidCallback();

    if (amount0Owed > 0) IERC20(s.token0).safeTransfer(pool, amount0Owed);
    if (amount1Owed > 0) IERC20(s.token1).safeTransfer(pool, amount1Owed);
  }

  function _mintPosition(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityDesired) internal returns (uint128 liquidityActual) {
    (, , liquidityActual) = IAlgebraPool(pool).mint(address(this), address(this), tickLower, tickUpper, liquidityDesired, abi.encode(pool));
  }

  function _burnPosition(address pool, int24 tickLower, int24 tickUpper, uint128 liquidity) internal returns (uint256 amount0, uint256 amount1) {
    (amount0, amount1) = IAlgebraPool(pool).burn(tickLower, tickUpper, liquidity, '');
  }

  function _collectPosition(address pool, int24 tickLower, int24 tickUpper) internal returns (uint128 amount0, uint128 amount1) {
    (amount0, amount1) = IAlgebraPool(pool).collect(address(this), tickLower, tickUpper, type(uint128).max, type(uint128).max);
  }

  // persistent-storage analog of v4's transient ActiveLiquidity.store (no EIP-1153 on this EVM target)
  function _storeActiveLiquidity(address pool, uint256 bucketIndex, uint128 liquidity) internal {
    if (liquidity == 0) return;
    poolState[pool].activeLiquidity[bucketIndex] = liquidity;
  }

  // persistent-storage analog of v4's transient ActiveLiquidity.takeAndClear
  function _takeActiveLiquidity(address pool, uint256 bucketIndex) internal returns (uint128 liquidity) {
    PoolState storage s = poolState[pool];
    liquidity = s.activeLiquidity[bucketIndex];
    if (liquidity != 0) s.activeLiquidity[bucketIndex] = 0;
  }

  function totalBalance(address pool, bool isToken0) public view returns (uint256 balance) {
    PoolState storage s = poolState[pool];
    address token = isToken0 ? s.token0 : s.token1;
    IERC4626 vault = isToken0 ? s.vault0 : s.vault1;

    balance = IERC20(token).balanceOf(address(this));
    if (address(vault) == address(0)) return balance;

    uint256 shares = vault.balanceOf(address(this));
    if (shares > 0) balance += vault.convertToAssets(shares);
  }

  function effectiveBalance(address pool, bool isToken0) public view returns (uint256 balance) {
    PoolState storage s = poolState[pool];
    address token = isToken0 ? s.token0 : s.token1;
    IERC4626 vault = isToken0 ? s.vault0 : s.vault1;

    balance = IERC20(token).balanceOf(address(this));
    if (address(vault) == address(0)) return balance;

    uint256 shares = vault.balanceOf(address(this));
    if (shares > 0) balance += _realizableVaultAssets(vault, shares);
  }

  function _realizableVaultAssets(IERC4626 vault, uint256 shares) private view returns (uint256) {
    try vault.maxWithdraw(address(this)) returns (uint256 cap) {
      if (cap > 0) {
        uint256 value = vault.convertToAssets(shares);
        return value < cap ? value : cap;
      }
      try vault.previewRedeem(shares) returns (uint256 assets) {
        return assets;
      } catch {
        return 0;
      }
    } catch {
      return vault.previewRedeem(shares);
    }
  }

  function _requireFeelessVault(IERC4626 vault) private view {
    uint256 probe = 10 ** vault.decimals();
    if (vault.previewDeposit(probe) != vault.convertToShares(probe)) revert VaultChargesEntryFee();
    try vault.previewRedeem(probe) returns (uint256 redeemable) {
      if (redeemable != vault.convertToAssets(probe)) revert VaultChargesExitFee();
    } catch {}
  }
}
