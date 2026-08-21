import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MAX_SQRT_RATIO } from "@cryptoalgebra/test-utils/utilities";
import { algebraPoolDeployerMockFixture } from "../../test-utils/externalFixtures";
import { Q96 } from "./helpers/priceConvergenceFixture";

const REBALANCE_THRESHOLD = 10n ** 20n;

describe("RebalanceEntrypoint", function () {
  async function deployFixture(
    reversed = false,
    initialSqrtPriceX96 = Q96,
    assetDecimals = 6,
    quoteDecimals = 18,
    shareOffset = 12,
  ) {
    const [owner, priceManager, other] = await ethers.getSigners();
    const core = await algebraPoolDeployerMockFixture();
    const pool = await core.createPool();
    await pool.initialize(initialSqrtPriceX96);
    const Token = await ethers.getContractFactory("MockERC20");
    const asset = await Token.deploy("Asset", "AST", assetDecimals);
    const quote = await Token.deploy("Quote", "QTE", quoteDecimals);
    const ERC4626 = await ethers.getContractFactory("MockERC4626");
    const share = await ERC4626.deploy(asset.target, shareOffset);
    const Vault = await ethers.getContractFactory("MockRebalanceVault");
    const token0 = reversed ? quote.target : share.target;
    const token1 = reversed ? share.target : quote.target;
    const vault = await Vault.deploy(
      core.factory.target,
      pool.target,
      token0,
      token1,
    );
    const Entrypoint = await ethers.getContractFactory("RebalanceEntrypoint");
    const entrypoint = await Entrypoint.deploy(
      vault.target,
      share.target,
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
      asset,
      quote,
      share,
      token0,
      token1,
    };
  }
  async function deployNormalFixture() {
    return deployFixture(false);
  }
  // > type(uint128).max (2**128), so squaring it directly would overflow uint256 and
  // _quoteAtSqrtPrice must take its FullMath.mulDiv-based branch instead of reverting.
  const EXTREME_SQRT_PRICE_X96 = Q96 << 33n;
  async function deployExtremePriceFixture() {
    return deployFixture(false, EXTREME_SQRT_PRICE_X96);
  }
  it("normalizes asset, share, and quote decimals", async function () {
    const { entrypoint } = await loadFixture(deployNormalFixture);
    const [target, current] = await entrypoint.preview(4n * 10n ** 18n);
    expect(target).to.equal(2n * Q96);
    expect(current).to.equal(Q96);
    expect(await entrypoint.assetDecimals()).to.equal(6);
    expect(await entrypoint.shareDecimals()).to.equal(18);
    expect(await entrypoint.quoteDecimals()).to.equal(18);
  });
  it("converts square asset prices to expected pool sqrt prices", async function () {
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
  it("converts square asset prices to inverse pool sqrt prices when share is token1", async function () {
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
    const { vault, share, asset, token0 } =
      await loadFixture(deployNormalFixture);
    const Entrypoint = await ethers.getContractFactory("RebalanceEntrypoint");

    await expect(
      Entrypoint.deploy(
        ethers.ZeroAddress,
        share.target,
        token0,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "ZeroAddress");
    await expect(
      Entrypoint.deploy(
        vault.target,
        ethers.ZeroAddress,
        token0,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "ZeroAddress");
    await expect(
      Entrypoint.deploy(
        vault.target,
        asset.target,
        token0,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "InvalidERC4626Vault");
    // asset is neither vault token, so it cannot be the threshold token either.
    await expect(
      Entrypoint.deploy(
        vault.target,
        share.target,
        asset.target,
        REBALANCE_THRESHOLD,
      ),
    ).to.be.revertedWithCustomError(Entrypoint, "InvalidThresholdToken");
  });
  it("inverts price when the ERC4626 share is token1", async function () {
    const { entrypoint } = await deployFixture(true);
    const [target] = await entrypoint.preview(4n * 10n ** 18n);
    expect(target).to.equal(Q96 / 2n);
    expect(await entrypoint.erc4626IsToken0()).to.equal(false);
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
    // token0 = share (ERC4626), token1 = quote; threshold token is token0 (the share).
    // Pool spot price is Q96 (1:1), so token1 idle balance converts to token0 units unchanged.
    const { vault, entrypoint, quote, share, asset, owner, token1 } =
      await loadFixture(deployNormalFixture);

    expect(await entrypoint.shouldRebalance()).to.equal(false);

    // Fund the threshold-token (token0/share) side by depositing into the ERC4626 share directly
    // to the vault; the actual minted share amount is read back rather than predicted.
    const assetAmount = 5n * 10n ** 6n;
    await asset.mint(owner.address, assetAmount);
    await asset.approve(share.target, assetAmount);
    await share.deposit(assetAmount, vault.target);
    const shareBalance = await share.balanceOf(vault.target);
    expect(shareBalance).to.be.lessThan(REBALANCE_THRESHOLD);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    // Top up the other side (quote/token1) with just enough, converted 1:1, to fall short.
    const remaining = REBALANCE_THRESHOLD - shareBalance;
    await quote.mint(vault.target, remaining - 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    // The last unit of idle balance tips the accumulated value over the threshold.
    await quote.mint(vault.target, 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(true);

    // Valuing the same two balances in token1 instead converts the other way round, which at
    // this 1:1 spot price has to land on the same verdict.
    await entrypoint.connect(owner).setThresholdToken(token1);
    expect(await entrypoint.shouldRebalance()).to.equal(true);
  });
  it("quotes idle balances against a pool price above type(uint128).max without reverting", async function () {
    // token0 = share, token1 = quote; value the idle share (token0) balance in quote (token1)
    // terms, which is the multiplying direction of _quoteAtSqrtPrice - the one that would
    // overflow uint256 if the contract always squared sqrtPriceX96 directly.
    const { owner, entrypoint, vault, asset, share, token1 } =
      await loadFixture(deployExtremePriceFixture);
    await entrypoint.connect(owner).setThresholdToken(token1);

    await asset.mint(owner.address, 1);
    await asset.approve(share.target, 1);
    await share.deposit(1, vault.target);
    const shareBalance = await share.balanceOf(vault.target);
    expect(shareBalance).to.be.greaterThan(0n);

    // EXTREME_SQRT_PRICE_X96 is an exact power of two, so this mirrors
    // _quoteAtSqrtPrice's math (ratioX128 = sqrtPrice**2 / 2**64, then * amount / Q128)
    // with no rounding, letting the threshold be pinned to the exact boundary.
    const priceRatio = (EXTREME_SQRT_PRICE_X96 * EXTREME_SQRT_PRICE_X96) / (1n << 192n);
    const quotedValue = shareBalance * priceRatio;

    await entrypoint.connect(owner).setRebalanceThreshold(quotedValue + 1n);
    expect(await entrypoint.shouldRebalance()).to.equal(false);

    await entrypoint.connect(owner).setRebalanceThreshold(quotedValue);
    expect(await entrypoint.shouldRebalance()).to.equal(true);
  });
  it("normalizes the other way round when the asset has more decimals than the quote", async function () {
    // Every other case here runs quote 18 / asset 6, so only the "quote has at least as many
    // decimals" side of the scaling has ever been taken. An 18-decimal asset quoted in a
    // 6-decimal token divides by the decimal gap instead of multiplying by it.
    const { entrypoint } = await deployFixture(false, Q96, 18, 6, 0);

    expect(await entrypoint.assetDecimals()).to.equal(18);
    expect(await entrypoint.quoteDecimals()).to.equal(6);
    expect(await entrypoint.shareDecimals()).to.equal(18);
    // 4 quote per asset, expressed in raw units: 4e18 scaled by the 1e12 decimal gap.
    const [target] = await entrypoint.preview(4n * 10n ** 30n);
    expect(target).to.equal(2n * Q96);
  });

  it("rejects a price too small to survive decimal scaling", async function () {
    // A price that scales down to nothing must revert rather than quietly quote zero. Two
    // separate guards can catch it: the asset-price scaling itself, and the share price after
    // the ERC4626 conversion.
    const scaledToNothing = await deployFixture(false, Q96, 18, 6, 0);
    await expect(
      scaledToNothing.entrypoint.preview(1),
    ).to.be.revertedWithCustomError(scaledToNothing.entrypoint, "InvalidPrice");

    // A share whose decimals dwarf its asset's converts one whole share into so few assets
    // that a nonzero asset price still collapses to a zero share price.
    const dwarfedByOffset = await deployFixture(false, Q96, 6, 18, 24);
    expect(await dwarfedByOffset.entrypoint.shareDecimals()).to.equal(30);
    await expect(
      dwarfedByOffset.entrypoint.preview(1),
    ).to.be.revertedWithCustomError(dwarfedByOffset.entrypoint, "InvalidPrice");
  });

  it("rejects a price whose pool sqrt price falls below the minimum tick", async function () {
    // With the share as token1 the pool price is inverted, so an extreme asset price maps to a
    // pool price below MIN_SQRT_RATIO rather than above the maximum.
    const { entrypoint } = await deployFixture(true);

    await expect(entrypoint.preview(10n ** 50n)).to.be.revertedWithCustomError(
      entrypoint,
      "InvalidPrice",
    );
  });

  it("rejects a rebalance target at or above the maximum sqrt price", async function () {
    const { priceManager, entrypoint } = await loadFixture(deployNormalFixture);

    await expect(
      entrypoint.connect(priceManager).rebalance(MAX_SQRT_RATIO),
    ).to.be.revertedWithCustomError(entrypoint, "InvalidPrice");
  });

  it("follows the ERC4626 exchange rate as it accrues", async function () {
    // The share's asset backing drifts on its own, with nobody calling this contract - yield
    // accrual is the normal case, not an edge case, and the target pool price has to move with
    // it. Donating assets straight to the share vault is that drift in one step.
    const { entrypoint, asset, share, owner } =
      await loadFixture(deployNormalFixture);
    const priceX18 = 4n * 10n ** 18n;
    const [before] = await entrypoint.preview(priceX18);
    expect(before).to.equal(2n * Q96);

    // convertToAssets(1 share) reads (totalAssets + 1) / (totalSupply + 10**offset): three wei
    // of donated asset against an empty vault quadruples it, so the sqrt price doubles.
    await asset.mint(owner.address, 3);
    await asset.transfer(share.target, 3);
    expect(await share.convertToAssets(10n ** 18n)).to.equal(4n * 10n ** 6n);

    const [after] = await entrypoint.preview(priceX18);
    expect(after).to.equal(4n * Q96);
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
