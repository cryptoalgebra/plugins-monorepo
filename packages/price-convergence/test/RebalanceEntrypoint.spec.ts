import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { algebraPoolDeployerMockFixture } from "../../test-utils/externalFixtures";
import { Q96 } from "./helpers/priceConvergenceFixture";

describe("RebalanceEntrypoint", function () {
  async function deployFixture(reversed = false) {
    const [owner, priceManager, other] = await ethers.getSigners();
    const core = await algebraPoolDeployerMockFixture();
    const pool = await core.createPool();
    await pool.initialize(Q96);
    const Token = await ethers.getContractFactory("MockERC20");
    const asset = await Token.deploy("Asset", "AST", 6);
    const quote = await Token.deploy("Quote", "QTE", 18);
    const ERC4626 = await ethers.getContractFactory("MockERC4626");
    const share = await ERC4626.deploy(asset.target, 12);
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
    const entrypoint = await Entrypoint.deploy(vault.target, share.target);
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
      share,
    };
  }
  async function deployNormalFixture() {
    return deployFixture(false);
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
    const { vault, share, asset } = await loadFixture(deployNormalFixture);
    const Entrypoint = await ethers.getContractFactory("RebalanceEntrypoint");

    await expect(
      Entrypoint.deploy(ethers.ZeroAddress, share.target),
    ).to.be.revertedWithCustomError(Entrypoint, "ZeroAddress");
    await expect(
      Entrypoint.deploy(vault.target, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(Entrypoint, "ZeroAddress");
    await expect(
      Entrypoint.deploy(vault.target, asset.target),
    ).to.be.revertedWithCustomError(Entrypoint, "InvalidERC4626Vault");
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
});
