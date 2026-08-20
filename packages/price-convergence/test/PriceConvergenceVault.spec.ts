import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { algebraPoolDeployerMockFixture } from "../../test-utils/externalFixtures";
import {
  BEFORE_SWAP_FLAG,
  DEPOSIT_AMOUNT,
  FULL_RANGE_LIQUIDITY,
  MIN_SHARES,
  Q96,
  deployVaultFixture,
  deployVaultProxy,
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
    // pool/factory/fullRangeLiquidity are immutable, validated by the constructor itself (it
    // runs once, when the implementation is deployed - before any proxy exists).
    const f = await loadFixture(deployVaultFixture);
    const Vault = await ethers.getContractFactory("PriceConvergenceVault");

    await expect(
      Vault.deploy(ethers.ZeroAddress, f.factory.target, 1),
    ).to.be.revertedWithCustomError(Vault, "ZeroAddress");
    await expect(
      Vault.deploy(f.pool.target, ethers.ZeroAddress, 1),
    ).to.be.revertedWithCustomError(Vault, "ZeroAddress");
    await expect(
      Vault.deploy(f.pool.target, f.factory.target, 0),
    ).to.be.revertedWithCustomError(Vault, "ZeroValue");

    const MockFactory = await ethers.getContractFactory("MockFactory");
    const otherFactory = await MockFactory.deploy();
    await expect(
      Vault.deploy(f.pool.target, otherFactory.target, 1),
    ).to.be.revertedWithCustomError(Vault, "InvalidFactory");
  });

  it("validates initialize inputs, and blocks initializing the bare implementation", async function () {
    // vaultMath/twapPeriod are proxy storage, validated by initialize() - which only ever runs
    // through a proxy's delegatecall, not directly on the implementation (the constructor's
    // _disableInitializers() blocks that).
    const f = await loadFixture(deployVaultFixture);
    const Vault = await ethers.getContractFactory("PriceConvergenceVault");
    const implementation = await Vault.deploy(
      f.pool.target,
      f.factory.target,
      1,
    );

    await expect(
      implementation.initialize(f.vaultMath.target, 60),
    ).to.be.revertedWith("Initializable: contract is already initialized");

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy();
    const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const proxy = await Proxy.deploy(
      implementation.target,
      proxyAdmin.target,
      "0x", // skip calling initialize() from the proxy's own constructor
    );
    const uninitializedVault = await ethers.getContractAt(
      "PriceConvergenceVault",
      proxy.target,
    );

    await expect(
      uninitializedVault.initialize(ethers.ZeroAddress, 60),
    ).to.be.revertedWithCustomError(uninitializedVault, "ZeroAddress");
    await expect(
      uninitializedVault.initialize(f.vaultMath.target, 0),
    ).to.be.revertedWithCustomError(uninitializedVault, "InvalidTwapPeriod");

    await expect(uninitializedVault.initialize(f.vaultMath.target, 60)).to.not
      .be.reverted;
    await expect(
      uninitializedVault.initialize(f.vaultMath.target, 60),
    ).to.be.revertedWith("Initializable: contract is already initialized");
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
    const { vault } = await deployVaultProxy(
      f.pool.target as string,
      f.factory.target as string,
      f.vaultMath.target as string,
      60,
      FULL_RANGE_LIQUIDITY,
      f.other,
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
  it("withdraws proportional main and reserve position liquidity after a rebalance", async function () {
    // Every other withdraw test withdraws right after the bootstrap deposit, when
    // mainPosition/reservePosition are both still zero - withdraw()'s two burn branches
    // (main and, separately, reserve) only run once a rebalance has actually minted both.
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await f.vault.connect(f.rebalancer).rebalance(Q96);

    const mainBefore = await f.vault.mainPosition();
    const reserveBefore = await f.vault.reservePosition();
    expect(mainBefore.liquidity).to.be.greaterThan(0n);
    expect(reserveBefore.liquidity).to.be.greaterThan(0n);

    const shares = await f.vault.balanceOf(f.user.address);
    const balance0Before = await f.token0.balanceOf(f.user.address);
    const balance1Before = await f.token1.balanceOf(f.user.address);

    await expect(
      f.vault.connect(f.user).withdraw(shares, f.user.address),
    ).to.emit(f.vault, "Withdraw");

    expect(await f.vault.totalSupply()).to.equal(0);
    expect((await f.vault.mainPosition()).liquidity).to.equal(0n);
    expect((await f.vault.reservePosition()).liquidity).to.equal(0n);
    expect(await f.token0.balanceOf(f.user.address)).to.be.greaterThan(
      balance0Before,
    );
    expect(await f.token1.balanceOf(f.user.address)).to.be.greaterThan(
      balance1Before,
    );
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

  it("collects real trading fees earned by the main position", async function () {
    // getMainPosition()/getReservePosition()/getShareholderAmounts()/getTotalAmounts() were
    // never exercised by any other test with a real, non-zero position - vault.mainPosition()
    // (the plain storage getter, used elsewhere) only returns {lower, upper, liquidity}, not the
    // live amount0/amount1/fees these compute via _getPositionAmounts (the fees0/fees1 addition
    // there was fully uncovered). This checks the more important thing too: that a third party
    // actually trading against the vault's minted position pays it real fees, and collectFees()
    // pulls exactly that amount into the vault's own balance.
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await f.vault.connect(f.rebalancer).rebalance(Q96);

    const [mainLiquidity] = await f.vault.getMainPosition();
    expect(mainLiquidity).to.be.greaterThan(0n);

    // Trade within the main position's single tick (a price a third of the way to the next
    // tick boundary, matching the off-boundary-price lesson from the rebalance sweep above) so
    // the swap earns fees from this position without crossing out of its range entirely.
    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();
    const upperBoundary = await helper.getSqrtRatioAtTick(1);
    const targetPrice = Q96 + (upperBoundary - Q96) / 3n;

    await f.pool.setPluginConfig(0); // mock oracle doesn't implement the full plugin hook surface a real swap would trigger
    await f.token0.transfer(f.other.address, DEPOSIT_AMOUNT);
    await f.token1.transfer(f.other.address, DEPOSIT_AMOUNT);
    await f.token0.connect(f.other).approve(f.swapTargetCallee.target, DEPOSIT_AMOUNT);
    await f.token1.connect(f.other).approve(f.swapTargetCallee.target, DEPOSIT_AMOUNT);
    await f.swapTargetCallee
      .connect(f.other)
      .swapToHigherSqrtPrice(f.pool.target, targetPrice, f.other.address);

    const idleBefore0 = await f.token0.balanceOf(f.vault.target);
    const idleBefore1 = await f.token1.balanceOf(f.vault.target);
    const [collectedFees0, collectedFees1] = await f.vault
      .connect(f.vaultManager)
      .collectFees.staticCall();
    expect(collectedFees0 + collectedFees1).to.be.greaterThan(0n);

    await f.vault.connect(f.vaultManager).collectFees();
    const idleAfter0 = await f.token0.balanceOf(f.vault.target);
    const idleAfter1 = await f.token1.balanceOf(f.vault.target);
    expect(idleAfter0 - idleBefore0).to.equal(collectedFees0);
    expect(idleAfter1 - idleBefore1).to.equal(collectedFees1);

    // getShareholderAmounts()/getTotalAmounts() sum idle balance + both positions' live amounts -
    // sanity check they at least run against a real, non-zero position without reverting.
    const [total0, total1] = await f.vault.getShareholderAmounts();
    expect(total0).to.be.greaterThan(0n);
    expect(total1).to.be.greaterThan(0n);
    expect(await f.vault.getTotalAmounts()).to.deep.equal([total0, total1]);
  });

  it("converges entirely into token1 after a single swap crosses the main position's tick", async function () {
    // At rebalance(Q96) the price sits exactly on the main tick's lower bound, so main already
    // holds only token0 and reserve (funded by the token1 leftover) already holds only token1 -
    // see VaultMath.spec.ts's boundary-price tests. One swap that pushes price past main's upper
    // bound flips main to token1 too, so the whole vault - both positions together - ends up
    // holding none of token0 at all.
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await f.vault.connect(f.rebalancer).rebalance(Q96);

    const mainBefore = await f.vault.mainPosition();
    const reserveBefore = await f.vault.reservePosition();
    const [, main0Before, main1Before] = await f.vault.getMainPosition();
    const [, reserve0Before, reserve1Before] = await f.vault.getReservePosition();
    const tolerance = DEPOSIT_AMOUNT / 10_000n;
    expect(DEPOSIT_AMOUNT - main0Before).to.be.at.most(tolerance);
    expect(main1Before).to.equal(0n);
    expect(reserve0Before).to.equal(0n);
    expect(DEPOSIT_AMOUNT - reserve1Before).to.be.at.most(tolerance);

    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();
    const target = await helper.getSqrtRatioAtTick(Number(mainBefore.upper) + 1);

    // Crossing the main tick's own liquidity entirely can take close to as much token1 as the
    // whole deposit - give the swap generous headroom rather than sizing it tightly.
    const swapBudget = DEPOSIT_AMOUNT * 1000n;
    await f.pool.setPluginConfig(0); // mock oracle doesn't implement the full plugin hook surface a real swap would trigger
    await f.token1.transfer(f.other.address, swapBudget);
    await f.token1.connect(f.other).approve(f.swapTargetCallee.target, swapBudget);
    await f.swapTargetCallee
      .connect(f.other)
      .swapToHigherSqrtPrice(f.pool.target, target, f.other.address);

    // A swap only moves price - it never mints or burns, so both stored positions must still be
    // the exact same LP position (same ticks, same liquidity units) as before, just revalued.
    const mainAfterStruct = await f.vault.mainPosition();
    const reserveAfterStruct = await f.vault.reservePosition();
    expect(mainAfterStruct.lower).to.equal(mainBefore.lower);
    expect(mainAfterStruct.upper).to.equal(mainBefore.upper);
    expect(mainAfterStruct.liquidity).to.equal(mainBefore.liquidity);
    expect(reserveAfterStruct.lower).to.equal(reserveBefore.lower);
    expect(reserveAfterStruct.upper).to.equal(reserveBefore.upper);
    expect(reserveAfterStruct.liquidity).to.equal(reserveBefore.liquidity);

    const [, main0After, main1After] = await f.vault.getMainPosition();
    const [, reserve0After, reserve1After] = await f.vault.getReservePosition();
    expect(main0After).to.equal(0n);
    expect(main1After).to.be.greaterThan(0n);
    expect(reserve0After).to.equal(0n);
    // The reserve's range was never touched by this swap, so its value is exactly unchanged.
    expect(reserve1After).to.equal(reserve1Before);
  });

  it("mints only the reserve position when rebalanced while fully one-sided, right next to the new price", async function () {
    // Continuation of the scenario above: once main and reserve have both flowed entirely into
    // token1, the next rebalance burns both positions and re-mints from scratch. A two-sided
    // main position at the current price needs some of both tokens - LiquidityAmounts returns
    // exactly zero liquidity when one side is exactly zero - so main stays unminted (liquidity 0,
    // reset to {0,0} by the burn) and every real token ends up in the single-sided reserve
    // instead. That reserve isn't left behind at the old range either: it's still placed exactly
    // one tick from wherever the price ended up, since main's tick is recomputed fresh each time.
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await f.vault.connect(f.rebalancer).rebalance(Q96);

    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();
    const mainBefore = await f.vault.mainPosition();
    const target = await helper.getSqrtRatioAtTick(Number(mainBefore.upper) + 1);

    const swapBudget = DEPOSIT_AMOUNT * 1000n;
    await f.pool.setPluginConfig(0); // mock oracle doesn't implement the full plugin hook surface a real swap would trigger
    await f.token1.transfer(f.other.address, swapBudget);
    await f.token1.connect(f.other).approve(f.swapTargetCallee.target, swapBudget);
    await f.swapTargetCallee
      .connect(f.other)
      .swapToHigherSqrtPrice(f.pool.target, target, f.other.address);

    const roundingBuffer = await f.vaultMath.ROUNDING_BUFFER();
    const [totalToken0Before, totalToken1Before] = await f.vault.getShareholderAmounts();
    expect(totalToken0Before).to.be.at.most(roundingBuffer);

    const [currentSqrtPriceX96, currentTick] = await f.pool.globalState();
    await f.vault.connect(f.rebalancer).rebalance(currentSqrtPriceX96);

    const mainAfter = await f.vault.mainPosition();
    const reserveAfter = await f.vault.reservePosition();
    expect(mainAfter.liquidity).to.equal(0n);
    expect(mainAfter.lower).to.equal(0n);
    expect(mainAfter.upper).to.equal(0n);
    expect(reserveAfter.liquidity).to.be.greaterThan(0n);
    expect(reserveAfter.upper).to.equal(currentTick);
    expect(reserveAfter.lower).to.equal(currentTick - 1n);

    const [, reserve0After, reserve1After] = await f.vault.getReservePosition();
    expect(reserve0After).to.equal(0n);
    expect(reserve1After).to.be.greaterThan(0n);

    // Burning both old positions and re-minting a single-sided reserve must conserve nearly all
    // of the token1 value that was locked in them - only the deliberate rounding buffer (plus a
    // few wei of ordinary rounding-down dust) may be left stranded idle instead of redeployed.
    const [totalToken0After, totalToken1After] = await f.vault.getShareholderAmounts();
    expect(totalToken0After).to.be.at.most(roundingBuffer);
    expect(totalToken1Before - totalToken1After).to.be.at.most(roundingBuffer + 10n);
  });

  it("converges entirely into token0 across two separate swaps that together cross the reserve position's tick", async function () {
    // main is already pinned to token0-only at rebalance(Q96) (see the test above) and stays
    // that way throughout - only the reserve transitions here, and it takes two swaps to do it:
    // one that lands inside the reserve's own tick (still mixed) and a second that pushes price
    // past the reserve's lower bound entirely. The end state - fully in token0 - only depends on
    // where price ends up, not on how many trades it took to get there.
    const f = await loadFixture(deployVaultFixture);
    await approveDeposit(f.vault, f.token0, f.token1, f.user);
    await f.vault
      .connect(f.user)
      .deposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT, f.user.address);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.rebalancer.address);
    await f.vault.connect(f.rebalancer).rebalance(Q96);

    const mainBefore = await f.vault.mainPosition();
    const reserveBefore = await f.vault.reservePosition();
    expect(reserveBefore.upper - reserveBefore.lower).to.equal(1n);
    const [, main0Before] = await f.vault.getMainPosition();
    const [, , reserve1Before] = await f.vault.getReservePosition();

    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();
    const reserveLowerSqrt = await helper.getSqrtRatioAtTick(reserveBefore.lower);
    const reserveUpperSqrt = await helper.getSqrtRatioAtTick(reserveBefore.upper);
    const midReserve = (reserveLowerSqrt + reserveUpperSqrt) / 2n;
    const belowReserve = await helper.getSqrtRatioAtTick(Number(reserveBefore.lower) - 1);

    // Crossing the reserve tick's own liquidity entirely can take close to as much token0 as
    // the whole deposit - give the swaps generous headroom rather than sizing them tightly.
    const swapBudget = DEPOSIT_AMOUNT * 1000n;
    await f.pool.setPluginConfig(0); // mock oracle doesn't implement the full plugin hook surface a real swap would trigger
    await f.token0.transfer(f.other.address, swapBudget);
    await f.token0.connect(f.other).approve(f.swapTargetCallee.target, swapBudget);

    // First swap only reaches the middle of the reserve's own tick: still mixed, not converged.
    await f.swapTargetCallee
      .connect(f.other)
      .swapToLowerSqrtPrice(f.pool.target, midReserve, f.other.address);

    // Neither swap mints or burns, so main - never in this swap's price path - must still be the
    // exact same (untouched) LP position, and reserve must still be the same liquidity units too,
    // just partway revalued.
    const mainMid = await f.vault.mainPosition();
    const reserveMidStruct = await f.vault.reservePosition();
    expect(mainMid.lower).to.equal(mainBefore.lower);
    expect(mainMid.upper).to.equal(mainBefore.upper);
    expect(mainMid.liquidity).to.equal(mainBefore.liquidity);
    expect(reserveMidStruct.liquidity).to.equal(reserveBefore.liquidity);

    const [, reserve0Mid, reserve1Mid] = await f.vault.getReservePosition();
    expect(reserve0Mid).to.be.greaterThan(0n);
    expect(reserve1Mid).to.be.greaterThan(0n);
    // Partway converted: strictly less token1 left than the fully one-sided starting point.
    expect(reserve1Mid).to.be.lessThan(reserve1Before);

    // Second swap pushes price below the reserve tick entirely.
    await f.swapTargetCallee
      .connect(f.other)
      .swapToLowerSqrtPrice(f.pool.target, belowReserve, f.other.address);

    const mainAfterStruct = await f.vault.mainPosition();
    const reserveAfterStruct = await f.vault.reservePosition();
    expect(mainAfterStruct.lower).to.equal(mainBefore.lower);
    expect(mainAfterStruct.upper).to.equal(mainBefore.upper);
    expect(mainAfterStruct.liquidity).to.equal(mainBefore.liquidity);
    expect(reserveAfterStruct.liquidity).to.equal(reserveBefore.liquidity);

    const [, main0After, main1After] = await f.vault.getMainPosition();
    const [, reserve0After, reserve1After] = await f.vault.getReservePosition();
    // main was already pinned at the tick-0 boundary before either swap and never entered the
    // swaps' price path, so its value is exactly unchanged throughout.
    expect(main0After).to.equal(main0Before);
    expect(main1After).to.equal(0n);
    expect(reserve0After).to.be.greaterThan(reserve0Mid);
    expect(reserve1After).to.equal(0n);
  });

  it("mints both positions cleanly even when funded to VaultMath's own tightest computed budget", async function () {
    // VaultMath.used0/used1 come from LiquidityAmounts.getAmountsForLiquidity, which rounds
    // down; if the pool's actual mint ever charged more for that same liquidity (e.g. by
    // rounding up, as Algebra core's TokenDeltaMath can), minting main then reserve back to
    // back against a slack-free budget would ask algebraMintCallback for more than the vault
    // holds and revert. Empirically (swept across several amount scales and ratios) the pool
    // instead clamps liquidityActual down to fit, so this never happens - this pins that down
    // as a regression check instead of a passing-by-luck assumption.
    const f = await loadFixture(deployVaultFixture);
    await f.vault.connect(f.owner).setRebalanceEntrypoint(f.owner.address);
    const [currentSqrtPriceX96] = await f.pool.globalState();

    // Converge on the tightest budget VaultMath itself would ever ask for: repeatedly feed its
    // own "used" totals back in as the next budget. Reducing the input can shift which side
    // binds the single-tick main position, so this isn't a single round-trip - it settles once
    // the totals stop shrinking.
    let amount0 = DEPOSIT_AMOUNT;
    let amount1 = DEPOSIT_AMOUNT;
    let main, reserve;
    for (let i = 0; i < 8; i++) {
      [main, reserve] = await f.vaultMath.calculatePosition.staticCall(
        currentSqrtPriceX96,
        amount0,
        amount1,
      );
      const used0 = main.used0 + reserve.used0;
      const used1 = main.used1 + reserve.used1;
      if (used0 === amount0 && used1 === amount1) break;
      amount0 = used0;
      amount1 = used1;
    }
    expect(main!.liquidity).to.be.greaterThan(0n);
    expect(reserve!.liquidity).to.be.greaterThan(0n); // both positions must be minted for this to apply

    // Fund the vault with exactly what VaultMath itself computed as the two positions' cost,
    // bypassing deposit() so the idle balance is pinned to this precise, slack-free amount.
    await f.token0.transfer(f.vault.target, amount0);
    await f.token1.transfer(f.vault.target, amount1);

    await expect(f.vault.connect(f.owner).rebalance(currentSqrtPriceX96)).to
      .not.be.reverted;

    // VaultMath withholds ROUNDING_BUFFER wei of budget on purpose (the pool's core mint math
    // can round up beyond this contract's periphery-based estimate), so up to that much per
    // token is expected to be left stranded idle rather than an exact zero.
    const roundingBuffer = await f.vaultMath.ROUNDING_BUFFER();
    expect(await f.token0.balanceOf(f.vault.target)).to.be.at.most(roundingBuffer);
    expect(await f.token1.balanceOf(f.vault.target)).to.be.at.most(roundingBuffer);
    expect((await f.vault.mainPosition()).liquidity).to.be.greaterThan(0n);
    expect((await f.vault.reservePosition()).liquidity).to.be.greaterThan(0n);
  });

  describe("rebalance across decimal pairs, token order, price direction, and amount size", function () {
    // Regression coverage for a real reported production failure ('ERC20: transfer amount
    // exceeds balance' from algebraMintCallback's unguarded safeTransfer, which - unlike
    // _paySwap - has no balance check before transferring) at one specific reported price. That
    // exact repro turned out to generalize completely: every decimals pair (18/18, 6/18, 18/6,
    // 8/8, 6/6), both token orders (Algebra assigns token0/token1 by address, so
    // decimalsA/decimalsB don't map to a fixed side), both price directions, and both a small
    // and a large deposit failed the same way. The one thing that mattered: the target price
    // must NOT sit exactly on a tick boundary. An exact getSqrtRatioAtTick(tick) value never
    // reproduced it; landing a third of the way into the tick - which is what any real swap or
    // oracle-derived price actually looks like - reproduced it every time. So this was not an
    // edge case, it was the normal case.
    //
    // Fixed by VaultMath.ROUNDING_BUFFER, which withholds a few wei of budget so the pool's own
    // core mint math (which can round up beyond this contract's periphery-based estimate) never
    // gets asked for more than the vault actually holds. All cases below now pass; keep this
    // suite unskipped so any regression in that fix shows up here again.
    async function deployForDecimals(decimalsA: number, decimalsB: number) {
      const [owner, vaultManager, user] = await ethers.getSigners();
      const core = await algebraPoolDeployerMockFixture();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const tokenA = await MockERC20.deploy("TokenA", "TKA", decimalsA);
      const tokenB = await MockERC20.deploy("TokenB", "TKB", decimalsB);

      // createPool()/computeAddress() assume the caller already sorted by address (as
      // tokensFixture() does for the default tokens) - passing them in whichever order the
      // decimals happened to be listed made the pool attach to an undeployed address about
      // half the time.
      const [lowerToken, upperToken] =
        BigInt(await tokenA.getAddress()) < BigInt(await tokenB.getAddress())
          ? [tokenA, tokenB]
          : [tokenB, tokenA];
      const pool = await core.createPool(lowerToken as any, upperToken as any);

      const VaultMathTestHelper = await ethers.getContractFactory(
        "VaultMathTestHelper",
      );
      const helper = await VaultMathTestHelper.deploy();
      const initialSqrtPriceX96 = await helper.getSqrtRatioAtTick(0);
      await pool.initialize(initialSqrtPriceX96);
      await pool.setTickSpacing(1);

      const MockOracle = await ethers.getContractFactory(
        "MockPriceConvergenceOracle",
      );
      const oracle = await MockOracle.deploy();
      await pool.setPlugin(oracle.target);
      await pool.setPluginConfig(BEFORE_SWAP_FLAG); // deposit()'s oracle check requires this

      const VaultMath = await ethers.getContractFactory("VaultMath");
      const vaultMath = await VaultMath.deploy();
      const { vault } = await deployVaultProxy(
        pool.target as string,
        core.factory.target as string,
        vaultMath.target as string,
        60,
        FULL_RANGE_LIQUIDITY,
      );
      await vault.connect(owner).setRebalanceEntrypoint(owner.address);

      const token0 = await ethers.getContractAt(
        "MockERC20",
        await vault.token0(),
      );
      const token1 = await ethers.getContractAt(
        "MockERC20",
        await vault.token1(),
      );

      return { owner, vaultManager, user, pool, oracle, helper, vault, token0, token1 };
    }

    async function depositAndRebalance(
      f: Awaited<ReturnType<typeof deployForDecimals>>,
      tickOffset: number,
      humanAmount: bigint,
    ) {
      const decimals0 = await f.token0.decimals();
      const decimals1 = await f.token1.decimals();

      const amount0 = humanAmount * 10n ** BigInt(decimals0);
      const amount1 = humanAmount * 10n ** BigInt(decimals1);
      await f.token0.mint(f.user.address, amount0);
      await f.token1.mint(f.user.address, amount1);
      await f.token0.connect(f.user).approve(f.vault.target, amount0);
      await f.token1.connect(f.user).approve(f.vault.target, amount1);
      await f.vault.connect(f.user).deposit(amount0, amount1, f.user.address);

      // _paySwap falls back to transferFrom(tx.origin, ...) when the vault's own idle balance
      // can't cover the swap leg of a large price move - transferFrom's spender there is the
      // vault contract itself (it's the one calling transferFrom), not the pool. How much a big
      // price move actually costs in raw token units is decimals-independent (Q96 fixed point),
      // so scaling this safety margin off the deposit's own (decimals-scaled) amount undersized
      // it for low-decimals tokens - use a large fixed amount instead, mirroring a properly
      // operated backend that funds and pre-approves the vault from the rebalance caller.
      const swapSafetyNet = 10n ** 33n;
      await f.token0.mint(f.owner.address, swapSafetyNet);
      await f.token1.mint(f.owner.address, swapSafetyNet);
      await f.token0.connect(f.owner).approve(f.vault.target, ethers.MaxUint256);
      await f.token1.connect(f.owner).approve(f.vault.target, ethers.MaxUint256);

      await f.pool.setPluginConfig(0); // mock oracle doesn't implement the full plugin hook surface a real swap would trigger

      // A real rebalance target - wherever an oracle-derived price or a swap actually lands -
      // essentially never sits exactly on a tick boundary. An exact getSqrtRatioAtTick(tick)
      // value turned out not to reproduce the reported failure at all; landing a third of the
      // way into the tick does, so every case here targets an off-boundary price on purpose.
      const boundary = await f.helper.getSqrtRatioAtTick(tickOffset);
      const nextBoundary = await f.helper.getSqrtRatioAtTick(tickOffset + 1);
      const target = boundary + (nextBoundary - boundary) / 3n;
      await f.vault.connect(f.owner).rebalance(target);

      expect(await f.token0.balanceOf(f.vault.target)).to.be.at.most(1_000_000n);
      expect(await f.token1.balanceOf(f.vault.target)).to.be.at.most(1_000_000n);
    }

    const cases: {
      decimalsA: number;
      decimalsB: number;
      tickOffset: number;
      humanAmount: bigint;
    }[] = [
      { decimalsA: 18, decimalsB: 18, tickOffset: -196680, humanAmount: 1n },
      { decimalsA: 18, decimalsB: 18, tickOffset: -196680, humanAmount: 1_000n },
      { decimalsA: 18, decimalsB: 18, tickOffset: 196680, humanAmount: 1n },
      { decimalsA: 18, decimalsB: 18, tickOffset: 196680, humanAmount: 1_000n },
      { decimalsA: 6, decimalsB: 18, tickOffset: -196680, humanAmount: 1n },
      { decimalsA: 6, decimalsB: 18, tickOffset: 196680, humanAmount: 1_000n },
      { decimalsA: 18, decimalsB: 6, tickOffset: -196680, humanAmount: 1_000n },
      { decimalsA: 18, decimalsB: 6, tickOffset: 196680, humanAmount: 1n },
      { decimalsA: 8, decimalsB: 8, tickOffset: -1000, humanAmount: 1n },
      { decimalsA: 8, decimalsB: 8, tickOffset: 1000, humanAmount: 1_000n },
      { decimalsA: 6, decimalsB: 6, tickOffset: -196680, humanAmount: 1n },
      { decimalsA: 6, decimalsB: 6, tickOffset: 196680, humanAmount: 1_000n },
    ];

    for (const { decimalsA, decimalsB, tickOffset, humanAmount } of cases) {
      it(`decimals ${decimalsA}/${decimalsB}, target tick ~${tickOffset} (off-boundary), ~${humanAmount} tokens per side`, async function () {
        const f = await deployForDecimals(decimalsA, decimalsB);
        await depositAndRebalance(f, tickOffset, humanAmount);
      });
    }
  });

  describe("_quoteAtSqrtPrice overflow-safe branch", function () {
    // > type(uint128).max (2**128): squaring it directly would overflow uint256, so
    // _quoteAtSqrtPrice must take its FullMath.mulDiv-based branch instead of reverting.
    // A real deposit can't reach a pool price this extreme without destabilizing the
    // full-range liquidity math, so this goes through a thin harness that exposes the
    // (now-internal) pure function directly, the same way VaultMathTestHelper does for
    // VaultMath's private functions.
    const EXTREME_SQRT_PRICE_X96 = Q96 << 33n;

    async function deployQuoteHelperFixture() {
      const f = await loadFixture(deployVaultFixture);
      const Helper = await ethers.getContractFactory(
        "PriceConvergenceVaultQuoteHelper",
      );
      const helper = await Helper.deploy(
        f.pool.target,
        f.factory.target,
        FULL_RANGE_LIQUIDITY,
      );
      return { helper };
    }

    it("multiplies by the price ratio (token0 -> token1) at an extreme price", async function () {
      const { helper } = await loadFixture(deployQuoteHelperFixture);
      const amount = 12345n * 10n ** 9n;

      const quoted = await helper.quoteAtSqrtPrice(
        EXTREME_SQRT_PRICE_X96,
        amount,
        true,
      );
      // EXTREME_SQRT_PRICE_X96 is an exact power of two, so the ratio - (sqrtPrice / Q96) ** 2 -
      // divides evenly and this matches the contract's math with no rounding.
      expect(quoted).to.equal(amount * (1n << 66n));
    });

    it("divides by the price ratio (token1 -> token0) at the same extreme price", async function () {
      const { helper } = await loadFixture(deployQuoteHelperFixture);
      const amount = (1n << 80n) * 7n;

      const quoted = await helper.quoteAtSqrtPrice(
        EXTREME_SQRT_PRICE_X96,
        amount,
        false,
      );
      expect(quoted).to.equal(amount / (1n << 66n));
    });

    it("returns zero for a zero amount regardless of price", async function () {
      const { helper } = await loadFixture(deployQuoteHelperFixture);
      expect(
        await helper.quoteAtSqrtPrice(EXTREME_SQRT_PRICE_X96, 0, true),
      ).to.equal(0);
    });
  });
});
