import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
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
    await expect(
      f.vault.connect(f.user).withdraw(shares, f.user.address),
    ).to.emit(f.vault, "Withdraw");
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
    await expect(f.vault.connect(f.rebalancer).rebalance(Q96)).to.emit(
      f.vault,
      "Rebalance",
    );
    expect((await f.vault.mainPosition()).liquidity).to.be.greaterThan(0);
  });
});
