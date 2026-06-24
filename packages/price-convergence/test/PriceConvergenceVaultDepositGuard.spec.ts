import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  DEPOSIT_AMOUNT,
  MIN_SHARES,
  deployVaultFixture,
} from "./helpers/priceConvergenceFixture";

describe("PriceConvergenceVaultDepositGuard", function () {
  async function deployFixture() {
    const f = await deployVaultFixture();
    const Guard = await ethers.getContractFactory(
      "PriceConvergenceVaultDepositGuard",
    );
    const guard = await Guard.deploy(f.vault.target);
    await f.token0.connect(f.user).approve(guard.target, DEPOSIT_AMOUNT);
    await f.token1.connect(f.user).approve(guard.target, DEPOSIT_AMOUNT);
    return { ...f, guard };
  }
  it("forwards deposits into the real pool", async function () {
    const f = await loadFixture(deployFixture);
    const shares = DEPOSIT_AMOUNT * 2n * MIN_SHARES;
    await expect(
      f.guard
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, shares, f.user.address),
    )
      .to.emit(f.guard, "DepositForwarded")
      .withArgs(
        f.user.address,
        f.user.address,
        DEPOSIT_AMOUNT,
        DEPOSIT_AMOUNT,
        shares,
      );
    expect(await f.vault.balanceOf(f.user.address)).to.equal(shares);
  });
  it("reverts atomically below minimum shares", async function () {
    const f = await loadFixture(deployFixture);
    const shares = DEPOSIT_AMOUNT * 2n * MIN_SHARES;
    const balance = await f.token0.balanceOf(f.user.address);
    await expect(
      f.guard
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, shares + 1n, f.user.address),
    ).to.be.revertedWithCustomError(f.guard, "InsufficientShares");
    expect(await f.token0.balanceOf(f.user.address)).to.equal(balance);
    expect(await f.vault.totalSupply()).to.equal(0);
  });
  it("forwards withdrawals and burns transferred shares", async function () {
    const f = await loadFixture(deployFixture);
    const shares = DEPOSIT_AMOUNT * 2n * MIN_SHARES;
    await f.guard
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, shares, f.user.address);
    await f.vault.connect(f.user).approve(f.guard.target, shares);
    await expect(
      f.guard.connect(f.user).withdraw(shares, f.user.address, 0, 0),
    ).to.emit(f.guard, "WithdrawForwarded");
    expect(await f.vault.balanceOf(f.user.address)).to.equal(0);
  });
  it("reverts atomically below withdrawal minimums", async function () {
    const f = await loadFixture(deployFixture);
    const shares = DEPOSIT_AMOUNT * 2n * MIN_SHARES;
    await f.guard
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, shares, f.user.address);
    await f.vault.connect(f.user).approve(f.guard.target, shares);
    await expect(
      f.guard
        .connect(f.user)
        .withdraw(shares, f.user.address, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT),
    ).to.be.revertedWithCustomError(f.guard, "InsufficientAmounts");
    expect(await f.vault.balanceOf(f.user.address)).to.equal(shares);
  });
});
