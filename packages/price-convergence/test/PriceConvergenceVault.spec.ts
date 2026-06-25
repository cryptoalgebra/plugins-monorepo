import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  BEFORE_SWAP_FLAG,
  DEPOSIT_AMOUNT,
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

    const VaultMath = await ethers.getContractFactory("VaultMath");
    const otherVaultMath = await VaultMath.deploy(otherFactory.target, 100);
    await expect(
      Vault.deploy(
        f.pool.target,
        f.factory.target,
        1,
        otherVaultMath.target,
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
  it("rejects invalid deposit inputs", async function () {
    const f = await loadFixture(deployVaultFixture);

    await expect(
      f.vault.connect(f.user).deposit(0, DEPOSIT_AMOUNT, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
    await expect(
      f.vault.connect(f.user).deposit(DEPOSIT_AMOUNT, 0, f.user.address),
    ).to.be.revertedWithCustomError(f.vault, "ZeroValue");
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
});
