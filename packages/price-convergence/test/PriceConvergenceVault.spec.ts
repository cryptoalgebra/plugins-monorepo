import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  BEFORE_SWAP_FLAG,
  DEPOSIT_AMOUNT,
  FULL_RANGE_LIQUIDITY,
  MIN_SHARES,
  Q96,
  deployVaultFixture,
} from "./helpers/priceConvergenceFixture";

describe("PriceConvergenceVault", function () {
  // Vault integration tests use the real Algebra pool.
  async function approveDeposit(
    vault: any,
    token0: any,
    token1: any,
    user: any,
  ) {
    await token0.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
    await token1.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
  }

  it("validates constructor inputs", async function () {
    const f = await loadFixture(deployVaultFixture);
    const Vault = await ethers.getContractFactory("PriceConvergenceVault");

    await expect(
      Vault.deploy(
        ethers.ZeroAddress,
        f.factory.target,
        1,
        f.vaultMath.target,
        60,
      ),
    ).to.be.revertedWithCustomError(Vault, "ZeroAddress");
    await expect(
      Vault.deploy(
        f.pool.target,
        ethers.ZeroAddress,
        1,
        f.vaultMath.target,
        60,
      ),
    ).to.be.revertedWithCustomError(Vault, "ZeroAddress");
    await expect(
      Vault.deploy(f.pool.target, f.factory.target, 0, f.vaultMath.target, 60),
    ).to.be.revertedWithCustomError(Vault, "ZeroValue");
    await expect(
      Vault.deploy(f.pool.target, f.factory.target, 1, f.vaultMath.target, 0),
    ).to.be.revertedWithCustomError(Vault, "InvalidTwapPeriod");

    const MockFactory = await ethers.getContractFactory("MockFactory");
    const otherFactory = await MockFactory.deploy();
    await expect(
      Vault.deploy(
        f.pool.target,
        otherFactory.target,
        1,
        f.vaultMath.target,
        60,
      ),
    ).to.be.revertedWithCustomError(Vault, "InvalidFactory");
  });

  it("gates and validates manager setters", async function () {
    const f = await loadFixture(deployVaultFixture);

    await expect(
      f.vault.connect(f.other).setRebalanceEntrypoint(f.rebalancer.address),
    ).to.be.revertedWithCustomError(f.vault, "OnlyVaultManager");
    await expect(
      f.vault
        .connect(f.vaultManager)
        .setRebalanceEntrypoint(ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(f.vault, "ZeroAddress");
    await expect(
      f.vault
        .connect(f.vaultManager)
        .setRebalanceEntrypoint(f.rebalancer.address),
    )
      .to.emit(f.vault, "RebalanceEntrypoint")
      .withArgs(f.rebalancer.address);

    await expect(
      f.vault.connect(f.other).setTwapPeriods(60, 15),
    ).to.be.revertedWithCustomError(f.vault, "OnlyVaultManager");
    await expect(
      f.vault.connect(f.vaultManager).setTwapPeriods(0, 0),
    ).to.be.revertedWithCustomError(f.vault, "InvalidTwapPeriod");
    await expect(
      f.vault.connect(f.vaultManager).setTwapPeriods(60, 61),
    ).to.be.revertedWithCustomError(f.vault, "InvalidTwapPeriod");
    await expect(f.vault.connect(f.vaultManager).setTwapPeriods(120, 30))
      .to.emit(f.vault, "TwapPeriods")
      .withArgs(120, 30);
    expect(await f.vault.twapPeriod()).to.equal(120);
    expect(await f.vault.auxTwapPeriod()).to.equal(30);

    await expect(
      f.vault.connect(f.other).setHysteresis(1),
    ).to.be.revertedWithCustomError(f.vault, "OnlyVaultManager");
    await expect(
      f.vault.connect(f.vaultManager).setHysteresis(10n ** 18n + 1n),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
    await expect(f.vault.connect(f.vaultManager).setHysteresis(10n ** 16n))
      .to.emit(f.vault, "Hysteresis")
      .withArgs(10n ** 16n);
    expect(await f.vault.hysteresis()).to.equal(10n ** 16n);
  });

  it("lets the deployer bootstrap the rebalance entrypoint once", async function () {
    const f = await loadFixture(deployVaultFixture);
    const Vault = await ethers.getContractFactory(
      "PriceConvergenceVault",
      f.other,
    );
    const vault = await Vault.deploy(
      f.pool.target,
      f.factory.target,
      FULL_RANGE_LIQUIDITY,
      f.vaultMath.target,
      60,
    );
    expect(await vault.deployer()).to.equal(f.other.address);

    // Only the deployer may bootstrap; a roleless third party cannot.
    await expect(
      vault.connect(f.user).setRebalanceEntrypoint(f.rebalancer.address),
    ).to.be.revertedWithCustomError(vault, "OnlyVaultManager");

    // The deployer holds no factory roles but wires the entrypoint while it is unset.
    await expect(
      vault.connect(f.other).setRebalanceEntrypoint(f.rebalancer.address),
    )
      .to.emit(vault, "RebalanceEntrypoint")
      .withArgs(f.rebalancer.address);

    // Once set, the deployer has no further authority over the entrypoint.
    await expect(
      vault.connect(f.other).setRebalanceEntrypoint(f.other.address),
    ).to.be.revertedWithCustomError(vault, "OnlyVaultManager");

    // A vault manager can still change it later.
    await expect(
      vault.connect(f.vaultManager).setRebalanceEntrypoint(f.user.address),
    )
      .to.emit(vault, "RebalanceEntrypoint")
      .withArgs(f.user.address);
  });
  it("gates and validates vault math replacement", async function () {
    const f = await loadFixture(deployVaultFixture);
    const VaultMath = await ethers.getContractFactory("VaultMath");
    const newMath = await VaultMath.deploy();

    await expect(
      f.vault.connect(f.other).setVaultMath(newMath.target),
    ).to.be.revertedWithCustomError(f.vault, "OnlyVaultManager");
    await expect(
      f.vault.connect(f.vaultManager).setVaultMath(ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(f.vault, "ZeroAddress");

    await expect(f.vault.connect(f.vaultManager).setVaultMath(newMath.target))
      .to.emit(f.vault, "VaultMath")
      .withArgs(newMath.target);
    expect(await f.vault.vaultMath()).to.equal(newMath.target);
  });
  it("uses the replaced vault math at the next rebalance", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);

    await f.vault.connect(f.rebalancer).rebalance(Q96);
    const main = await f.vault.mainPosition();
    const reserve = await f.vault.reservePosition();
    expect(main.upper - main.lower).to.equal(1n);
    expect(reserve.upper - reserve.lower).to.equal(1n);

    const VaultMath = await ethers.getContractFactory("VaultMath");
    const newMath = await VaultMath.deploy();
    await f.vault.connect(f.vaultManager).setVaultMath(newMath.target);
    expect(await f.vault.vaultMath()).to.equal(newMath.target);

    // The replacement takes effect at the next rebalance: it is the newly set instance's
    // calculatePosition that produced these positions, not the original one.
    await f.vault.connect(f.rebalancer).rebalance(Q96);
    const mainAfter = await f.vault.mainPosition();
    const reserveAfter = await f.vault.reservePosition();
    expect(mainAfter.liquidity).to.be.greaterThan(0n);
    expect(reserveAfter.liquidity).to.be.greaterThan(0n);
  });
  it("deposits into the real pool", async function () {
    const { user, token0, token1, vault } =
      await loadFixture(deployVaultFixture);
    await approveDeposit(vault, token0, token1, user);
    await expect(
      vault.connect(user).deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, user.address),
    ).to.emit(vault, "FullRangeInitialized");
    expect(await vault.balanceOf(user.address)).to.equal(
      DEPOSIT_AMOUNT * 2n * MIN_SHARES,
    );
  });
  it("allows single-sided deposits after the full range is initialized", async function () {
    const { user, token0, token1, vault } =
      await loadFixture(deployVaultFixture);
    // Bootstrap with a two-sided deposit so the full-range seed is in place.
    await approveDeposit(vault, token0, token1, user);
    await vault
      .connect(user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, user.address);
    const afterBootstrap = await vault.balanceOf(user.address);

    // token0-only deposit now succeeds and mints additional shares.
    await token0.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
    await expect(
      vault.connect(user).deposit(DEPOSIT_AMOUNT, 0, user.address),
    ).to.emit(vault, "Deposit");
    const afterToken0 = await vault.balanceOf(user.address);
    expect(afterToken0).to.be.greaterThan(afterBootstrap);

    // token1-only deposit also succeeds.
    await token1.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
    await expect(
      vault.connect(user).deposit(0, DEPOSIT_AMOUNT, user.address),
    ).to.emit(vault, "Deposit");
    expect(await vault.balanceOf(user.address)).to.be.greaterThan(afterToken0);
  });
  it("rejects a single-sided bootstrapping deposit", async function () {
    const { user, token0, vault } = await loadFixture(deployVaultFixture);
    // Before the full range exists both tokens are required: the full-range mint owes both sides, so
    // a single-sided bootstrap reverts inside the mint callback (token0 is approved to isolate that).
    await token0.connect(user).approve(vault.target, DEPOSIT_AMOUNT);
    await expect(vault.connect(user).deposit(DEPOSIT_AMOUNT, 0, user.address)).to
      .be.reverted;
  });
  it("rejects invalid deposit inputs", async function () {
    const f = await loadFixture(deployVaultFixture);

    // Both-zero is rejected explicitly; single-sided is rejected by the bootstrap mint (no guard).
    await expect(
      f.vault.connect(f.user).deposit(0, 0, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
    await expect(f.vault.connect(f.user).deposit(0, DEPOSIT_AMOUNT, f.user.address))
      .to.be.reverted;
    await expect(f.vault.connect(f.user).deposit(DEPOSIT_AMOUNT, 0, f.user.address))
      .to.be.reverted;
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(f.vault, "ZeroAddress");
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.vault.target),
    ).to.be.revertedWithCustomError(f.vault, "ZeroAddress");
  });
  it("rejects a first deposit fully consumed by the full-range seed", async function () {
    const { user, token0, token1, vault } =
      await loadFixture(deployVaultFixture);
    // At sqrtPrice = Q96 the full-range seed (FULL_RANGE_LIQUIDITY) owes ~1000 of each token, so a
    // first deposit of exactly that leaves zero shareholder value. Without the guard this would
    // brick every future deposit (NAV == 0) and strand the minted shares.
    await token0.connect(user).approve(vault.target, FULL_RANGE_LIQUIDITY);
    await token1.connect(user).approve(vault.target, FULL_RANGE_LIQUIDITY);
    await expect(
      vault
        .connect(user)
        .deposit(FULL_RANGE_LIQUIDITY, FULL_RANGE_LIQUIDITY, user.address),
    ).to.be.revertedWithCustomError(vault, "ZeroValue");

    // A subsequent healthy deposit still works: the failed attempt left no state behind.
    await approveDeposit(vault, token0, token1, user);
    await expect(
      vault.connect(user).deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, user.address),
    ).to.emit(vault, "FullRangeInitialized");
  });
  it("rejects deposits when oracle checks fail", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);

    await f.pool.setPluginConfig(0);
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "OracleNotConnected");

    await f.pool.setPluginConfig(BEFORE_SWAP_FLAG);
    await f.oracle.setTwapTick(10_000);
    await f.oracle.setReturnCurrentTimestamp(true);
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "PriceManipulation");
  });

  it("withdraws and permits a later deposit", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    const shares = await f.vault.balanceOf(f.user.address);
    await expect(
      f.vault.connect(f.user).withdraw(shares, f.user.address),
    ).to.emit(f.vault, "Withdraw");
    expect(await f.vault.totalSupply()).to.equal(0);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address),
    ).to.not.emit(f.vault, "FullRangeInitialized");
  });
  it("does not return more tokens than deposited on immediate withdraw", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);

    const balance0Before = await f.token0.balanceOf(f.user.address);
    const balance1Before = await f.token1.balanceOf(f.user.address);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    const shares = await f.vault.balanceOf(f.user.address);
    await f.vault.connect(f.user).withdraw(shares, f.user.address);

    expect(await f.token0.balanceOf(f.user.address)).to.be.at.most(
      balance0Before,
    );
    expect(await f.token1.balanceOf(f.user.address)).to.be.at.most(
      balance1Before,
    );
  });
  it("enforces MIN_SHARES on partial withdrawals", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    const supply = await f.vault.totalSupply();
    await expect(
      f.vault
        .connect(f.user)
        .withdraw(supply - MIN_SHARES + 1n, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "InvalidShares");
  });
  it("uses Factory roles and allows withdrawal while paused", async function () {
    const f = await loadFixture(deployVaultFixture);
    await expect(
      f.vault.connect(f.other).pause(),
    ).to.be.revertedWithCustomError(f.vault, "OnlyVaultManager");
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    const shares = await f.vault.balanceOf(f.user.address);
    await f.vault.connect(f.vaultManager).pause();
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await expect(
      f.vault
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address),
    ).to.be.revertedWith("Pausable: paused");
    await expect(
      f.vault.connect(f.user).withdraw(shares, f.user.address),
    ).to.emit(f.vault, "Withdraw");
  });
  it("rejects invalid withdrawals", async function () {
    const f = await loadFixture(deployVaultFixture);

    await expect(
      f.vault.connect(f.user).withdraw(0, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
    await expect(
      f.vault.connect(f.user).withdraw(1, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
    await expect(
      f.vault.connect(f.user).withdraw(1, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(f.vault, "ZeroAddress");
  });
  it("only permits its configured entrypoint to rebalance", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await expect(
      f.vault.connect(f.other).rebalance(Q96),
    ).to.be.revertedWithCustomError(f.vault, "OnlyRebalanceEntrypoint");
    await expect(
      f.vault.connect(f.rebalancer).rebalance(1),
    ).to.be.revertedWithCustomError(f.vault, "InvalidPosition");
    await expect(f.vault.connect(f.rebalancer).rebalance(Q96)).to.emit(
      f.vault,
      "Rebalance",
    );
    expect((await f.vault.mainPosition()).liquidity).to.be.greaterThan(0);
  });
  it("deploys nearly all idle balance into positions after rebalance, without stranding either token", async function () {
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);

    // The full-range bootstrap mint only uses a sliver of the deposit; most of it is
    // still sitting idle in the vault ahead of the first rebalance.
    const idleBefore0 = await f.token0.balanceOf(f.vault.target);
    const idleBefore1 = await f.token1.balanceOf(f.vault.target);
    expect(idleBefore0).to.be.greaterThan(0n);
    expect(idleBefore1).to.be.greaterThan(0n);

    await f.vault.connect(f.rebalancer).rebalance(Q96);

    // Regression coverage for the leftover-side bug: both tokens must end up deployed into
    // the main or reserve position, not stranded idle in the vault.
    const idleAfter0 = await f.token0.balanceOf(f.vault.target);
    const idleAfter1 = await f.token1.balanceOf(f.vault.target);
    const tolerance = DEPOSIT_AMOUNT / 10_000n;
    expect(idleAfter0).to.be.at.most(tolerance);
    expect(idleAfter1).to.be.at.most(tolerance);

    const main = await f.vault.mainPosition();
    const reserve = await f.vault.reservePosition();
    expect(main.liquidity).to.be.greaterThan(0n);
    expect(reserve.liquidity).to.be.greaterThan(0n);
  });
  it("moves pool price exactly to the rebalance target limit", async function () {
    const f = await loadFixture(deployVaultFixture);
    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();
    const target = await helper.getSqrtRatioAtTick(100);

    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.pool.setPluginConfig(0);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);

    await expect(f.vault.connect(f.rebalancer).rebalance(target)).to.emit(
      f.vault,
      "Rebalance",
    );
    const [sqrtPriceX96] = await f.pool.globalState();
    expect(sqrtPriceX96).to.equal(target);
  });
});
