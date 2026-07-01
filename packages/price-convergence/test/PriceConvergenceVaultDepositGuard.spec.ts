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
  it("rejects a zero vault", async function () {
    const Guard = await ethers.getContractFactory(
      "PriceConvergenceVaultDepositGuard",
    );

    await expect(
      Guard.deploy(ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(Guard, "ZeroAddress");
  });
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
  it("forwards single-sided deposits after the full range exists", async function () {
    const f = await loadFixture(deployFixture);
    // Bootstrap with a two-sided deposit through the guard.
    await f.guard
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, 0, f.user.address);

    // token0-only deposit is forwarded (token1 is neither pulled nor approved).
    await f.token0.connect(f.user).approve(f.guard.target, DEPOSIT_AMOUNT);
    await expect(
      f.guard.connect(f.user).deposit(DEPOSIT_AMOUNT, 0, 0, f.user.address),
    ).to.emit(f.guard, "DepositForwarded");

    // token1-only deposit is forwarded.
    await f.token1.connect(f.user).approve(f.guard.target, DEPOSIT_AMOUNT);
    await expect(
      f.guard.connect(f.user).deposit(0, DEPOSIT_AMOUNT, 0, f.user.address),
    ).to.emit(f.guard, "DepositForwarded");
  });
  it("rejects invalid deposit recipients before moving tokens", async function () {
    const f = await loadFixture(deployFixture);

    await expect(
      f.guard
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, 0, ethers.ZeroAddress),
    ).to.be.revertedWithCustomError(f.guard, "InvalidRecipient");
    await expect(
      f.guard
        .connect(f.user)
        .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, 0, f.guard.target),
    ).to.be.revertedWithCustomError(f.guard, "InvalidRecipient");
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
  it("rejects invalid withdrawal recipients before moving shares", async function () {
    const f = await loadFixture(deployFixture);

    await expect(
      f.guard.connect(f.user).withdraw(1, ethers.ZeroAddress, 0, 0),
    ).to.be.revertedWithCustomError(f.guard, "InvalidRecipient");
    await expect(
      f.guard.connect(f.user).withdraw(1, f.guard.target, 0, 0),
    ).to.be.revertedWithCustomError(f.guard, "InvalidRecipient");
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
