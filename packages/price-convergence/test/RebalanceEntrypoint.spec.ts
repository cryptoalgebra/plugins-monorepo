import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { algebraPoolDeployerMockFixture } from "../../test-utils/externalFixtures";
import { Q96 } from "./helpers/priceConvergenceFixture";

describe("RebalanceEntrypoint", function () {
  async function deployFixture(reversed = false) {
    const [, priceManager, other] = await ethers.getSigners();
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
    const role = ethers.keccak256(
      ethers.toUtf8Bytes("PRICE_CONVERGENCE_PRICE_MANAGER"),
    );
    await core.factory.grantRole(role, priceManager.address);
    return { priceManager, other, pool, vault, entrypoint };
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
  it("inverts price when the ERC4626 share is token1", async function () {
    const { entrypoint } = await deployFixture(true);
    const [target] = await entrypoint.preview(4n * 10n ** 18n);
    expect(target).to.equal(Q96 / 2n);
    expect(await entrypoint.erc4626IsToken0()).to.equal(false);
  });
  it("requires the price-manager role and forwards the target", async function () {
    const { priceManager, other, vault, entrypoint } =
      await loadFixture(deployNormalFixture);
    const target = 2n * Q96;
    await expect(
      entrypoint.connect(other).rebalance(target),
    ).to.be.revertedWithCustomError(entrypoint, "OnlyPriceManager");
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
