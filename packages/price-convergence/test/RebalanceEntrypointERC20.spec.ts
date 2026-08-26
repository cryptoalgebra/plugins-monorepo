import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { algebraPoolDeployerMockFixture } from "../../test-utils/externalFixtures";
import { Q96 } from "./helpers/priceConvergenceFixture";

const REBALANCE_THRESHOLD = 10n ** 20n;

describe("RebalanceEntrypointERC20", function () {
  async function deployFixture(
    reversed = false,
    initialSqrtPriceX96 = Q96,
    baseDecimals = 18,
    quoteDecimals = 18,
  ) {
    const [owner, priceManager, other] = await ethers.getSigners();
    const core = await algebraPoolDeployerMockFixture();
    const pool = await core.createPool();
    await pool.initialize(initialSqrtPriceX96);
    const Token = await ethers.getContractFactory("MockERC20");
    const base = await Token.deploy("Base", "BASE", baseDecimals);
    const quote = await Token.deploy("Quote", "QTE", quoteDecimals);
    const Vault = await ethers.getContractFactory("MockRebalanceVault");
    const token0 = reversed ? quote.target : base.target;
    const token1 = reversed ? base.target : quote.target;
    const vault = await Vault.deploy(
      core.factory.target,
      pool.target,
      token0,
      token1,
    );
    const Entrypoint = await ethers.getContractFactory(
      "RebalanceEntrypointERC20",
    );
    const entrypoint = await Entrypoint.deploy(
      vault.target,
      base.target,
      token0,
      REBALANCE_THRESHOLD,
    );
    const role = await entrypoint.REBALANCER_ROLE();
    await core.factory.grantRole(role, priceManager.address);
    return {
      owner,
      priceManager,
      other,
      pool,
      vault,
      entrypoint,
      base,
      quote,
      token0,
      token1,
    };
  }
  async function deployNormalFixture() {
    return deployFixture(false);
  }
  async function deployMixedDecimalsFixture() {
    return deployFixture(false, Q96, 6, 18);
  }
  // > type(uint128).max (2**128), so squaring it directly would overflow uint256 and
  // _quoteAtSqrtPrice must take its FullMath.mulDiv-based branch instead of reverting.
  const EXTREME_SQRT_PRICE_X96 = Q96 << 33n;
  async function deployExtremePriceFixture() {
    return deployFixture(false, EXTREME_SQRT_PRICE_X96);
  }
  it("normalizes base and quote decimals", async function () {
    // base has 6 decimals, quote has 18: a human price of 4 (quote per base) is a raw pool
    // price of 4 * 10^(18-6), so the expected sqrt price picks up a 10^6 factor on top of the
    // plain sqrt(4) - unlike the ERC4626 variant, there's no share/asset conversion step here
    // to cancel it back out.
    const { entrypoint } = await loadFixture(deployMixedDecimalsFixture);
    const [target, current] = await entrypoint.preview(4n * 10n ** 18n);
    expect(target).to.equal(2n * Q96 * 1_000_000n);
    expect(current).to.equal(Q96);
    expect(await entrypoint.baseDecimals()).to.equal(6);
    expect(await entrypoint.quoteDecimals()).to.equal(18);
  });
  it("converts square base prices to expected pool sqrt prices", async function () {
    const { entrypoint } = await loadFixture(deployNormalFixture);
    const cases = [
      { price: 1n, expected: Q96 },
      { price: 4n, expected: 2n * Q96 },
      { price: 9n, expected: 3n * Q96 },
      { price: 16n, expected: 4n * Q96 },
    ];

    for (const { price, expected } of cases) {
      const [target] = await entrypoint.preview(price * 10n ** 18n);
      expect(target).to.equal(expected);
    }
  });
  it("converts square base prices to inverse pool sqrt prices when base is token1", async function () {
    const { entrypoint } = await deployFixture(true);
    const cases = [
      { price: 1n, expected: Q96 },
      { price: 4n, expected: Q96 / 2n },
      { price: 9n, expected: Q96 / 3n },
      { price: 16n, expected: Q96 / 4n },
    ];

    for (const { price, expected } of cases) {
      const [target] = await entrypoint.preview(price * 10n ** 18n);
      expect(target).to.equal(expected);
    }
  });
  it("validates constructor inputs", async function () {
    const { vault, base, other, token0 } =
      await loadFixture(deployNormalFixture);
    const Entrypoint = await ethers.getContractFactory(
      "RebalanceEntrypointERC20",
    );

    await expect(
      Entrypoint.deploy(
        ethers.ZeroAddress,
        base.target,
        token0,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "ZeroAddress");
    await expect(
      Entrypoint.deploy(
        vault.target,
        other.address,
        token0,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "InvalidBaseToken");
    // other.address is neither vault token, so it cannot be the threshold token either.
    await expect(
      Entrypoint.deploy(
        vault.target,
        base.target,
        other.address,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "InvalidThresholdToken");
  });
  it("inverts price when the base token is token1", async function () {
    const { entrypoint } = await deployFixture(true);
    const [target] = await entrypoint.preview(4n * 10n ** 18n);
    expect(target).to.equal(Q96 / 2n);
    expect(await entrypoint.baseIsToken0()).to.equal(false);
  });
  it("requires the rebalancer role and forwards the target", async function () {
    const { owner, priceManager, other, vault, entrypoint } =
      await loadFixture(deployNormalFixture);
    const target = 2n * Q96;
    expect(await entrypoint.isAuthorizedRebalancer(owner.address)).to.equal(
      true,
    );
    expect(
      await entrypoint.isAuthorizedRebalancer(priceManager.address),
    ).to.equal(true);
    expect(await entrypoint.isAuthorizedRebalancer(other.address)).to.equal(
      false,
    );
    await expect(
      entrypoint.connect(other).rebalance(target),
    ).to.be.revertedWithCustomError(entrypoint, "OnlyRebalancer");
    await expect(entrypoint.connect(priceManager).rebalance(target))
      .to.emit(entrypoint, "Rebalance")
      .withArgs(target, Q96);
    expect(await vault.lastTargetSqrtPriceX96()).to.equal(target);
    expect(await vault.lastRebalanceCaller()).to.equal(entrypoint.target);
  });
  it("rejects zero prices and invalid pool targets", async function () {
    const { priceManager, entrypoint } = await loadFixture(deployNormalFixture);
    await expect(entrypoint.preview(0)).to.be.revertedWithCustomError(
      entrypoint,
      "InvalidPrice",
    );
    await expect(
      entrypoint.connect(priceManager).rebalance(1),
    ).to.be.revertedWithCustomError(entrypoint, "InvalidPrice");
  });
  it("flags accumulated idle balances, valued at the pool spot price, against the threshold", async function () {
    // token0 = base, token1 = quote; threshold token is token0 (the base).
    // Pool spot price is Q96 (1:1), so token1 idle balance converts to token0 units unchanged.
    const { vault, entrypoint, quote, base } =
      await loadFixture(deployNormalFixture);

    expect(await entrypoint.shouldRebalance()).to.equal(false);

    const baseAmount = 5n * 10n ** 18n;
    await base.mint(vault.target, baseAmount);
    expect(baseAmount).to.be.lessThan(REBALANCE_THRESHOLD);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    // Top up the other side (quote/token1) with just enough, converted 1:1, to fall short.
    const remaining = REBALANCE_THRESHOLD - baseAmount;
    await quote.mint(vault.target, remaining - 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    // The last unit of idle balance tips the accumulated value over the threshold.
    await quote.mint(vault.target, 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(true);
  });
  it("quotes idle balances against a pool price above type(uint128).max without reverting", async function () {
    // token0 = base, token1 = quote; value the idle base (token0) balance in quote (token1)
    // terms, which is the multiplying direction of _quoteAtSqrtPrice - the one that would
    // overflow uint256 if the contract always squared sqrtPriceX96 directly.
    const { owner, entrypoint, vault, base, token1 } =
      await loadFixture(deployExtremePriceFixture);
    await entrypoint.connect(owner).setThresholdToken(token1);

    await base.mint(vault.target, 1);
    const baseBalance = await base.balanceOf(vault.target);
    expect(baseBalance).to.equal(1n);

    // EXTREME_SQRT_PRICE_X96 is an exact power of two, so this mirrors
    // _quoteAtSqrtPrice's math (ratioX128 = sqrtPrice**2 / 2**64, then * amount / Q128)
    // with no rounding, letting the threshold be pinned to the exact boundary.
    const priceRatio = (EXTREME_SQRT_PRICE_X96 * EXTREME_SQRT_PRICE_X96) / (1n << 192n);
    const quotedValue = baseBalance * priceRatio;

    await entrypoint.connect(owner).setRebalanceThreshold(quotedValue + 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    await entrypoint.connect(owner).setRebalanceThreshold(quotedValue);
    expect(await entrypoint.shouldRebalance()).to.equal(true);
  });
  it("gates and applies the threshold setters", async function () {
    const { owner, other, entrypoint, token0, token1 } =
      await loadFixture(deployNormalFixture);

    await expect(
      entrypoint.connect(other).setThresholdToken(token1),
    ).to.be.revertedWithCustomError(entrypoint, "OnlyVaultManager");
    await expect(
      entrypoint.connect(other).setRebalanceThreshold(1),
    ).to.be.revertedWithCustomError(entrypoint, "OnlyVaultManager");

    await expect(
      entrypoint.connect(owner).setThresholdToken(other.address),
    ).to.be.revertedWithCustomError(entrypoint, "InvalidThresholdToken");

    await expect(entrypoint.connect(owner).setThresholdToken(token1))
      .to.emit(entrypoint, "ThresholdToken")
      .withArgs(token1);
    expect(await entrypoint.thresholdToken()).to.equal(token1);

    const newThreshold = REBALANCE_THRESHOLD * 2n;
    await expect(
      entrypoint.connect(owner).setRebalanceThreshold(newThreshold),
    )
      .to.emit(entrypoint, "RebalanceThreshold")
      .withArgs(newThreshold);
    expect(await entrypoint.rebalanceThreshold()).to.equal(newThreshold);
  });
});
