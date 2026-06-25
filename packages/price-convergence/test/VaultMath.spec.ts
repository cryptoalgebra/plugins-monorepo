import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("VaultMath", function () {
  const WIDTH = 100n;
  const Q96 = 1n << 96n;
  const Q192 = 1n << 192n;
  const BALANCE_SCALE = 10n ** 12n;

  async function deployFixture() {
    const [, other] = await ethers.getSigners();
    const MockFactory = await ethers.getContractFactory("MockFactory");
    const factory = await MockFactory.deploy();

    const VaultMath = await ethers.getContractFactory("VaultMath");
    const vaultMath = await VaultMath.deploy(factory.target, WIDTH);

    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();

    return { factory, vaultMath, helper, other };
  }

  function balancedRawAmounts(sqrtPriceX96: bigint) {
    const priceNumerator = sqrtPriceX96 * sqrtPriceX96;
    if (priceNumerator < Q192) {
      return {
        amount0: (Q192 * BALANCE_SCALE) / priceNumerator,
        amount1: BALANCE_SCALE,
      };
    }

    return {
      amount0: BALANCE_SCALE,
      amount1: (priceNumerator * BALANCE_SCALE) / Q192,
    };
  }

  it("validates constructor width and factory", async function () {
    const MockFactory = await ethers.getContractFactory("MockFactory");
    const factory = await MockFactory.deploy();
    const VaultMath = await ethers.getContractFactory("VaultMath");

    await expect(
      VaultMath.deploy(ethers.ZeroAddress, WIDTH),
    ).to.be.revertedWithCustomError(VaultMath, "ZeroAddress");
    await expect(
      VaultMath.deploy(factory.target, 0),
    ).to.be.revertedWithCustomError(VaultMath, "InvalidPositionWidth");
    await expect(
      VaultMath.deploy(factory.target, 887_273),
    ).to.be.revertedWithCustomError(VaultMath, "InvalidPositionWidth");
  });

  it("gates position width updates through the factory role", async function () {
    const { vaultMath, other } = await loadFixture(deployFixture);

    await expect(
      vaultMath.connect(other).setPositionWidth(200),
    ).to.be.revertedWithCustomError(vaultMath, "OnlyVaultManager");
    await expect(vaultMath.setPositionWidth(200))
      .to.emit(vaultMath, "PositionWidth")
      .withArgs(200);
    expect(await vaultMath.positionWidth()).to.equal(200);
  });

  it("rejects empty balances", async function () {
    const { vaultMath } = await loadFixture(deployFixture);

    await expect(
      vaultMath.calculatePosition(Q96, 0, 0),
    ).to.be.revertedWithCustomError(vaultMath, "ZeroAmounts");
  });

  it("places one-sided balances on the correct side of the current price", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);

    const token0Only = await vaultMath.calculatePosition(
      sqrtPriceX96,
      BALANCE_SCALE,
      0,
    );
    expect(token0Only[0]).to.be.at.least(0);
    expect(token0Only[1] - token0Only[0]).to.equal(WIDTH);
    expect(token0Only[3]).to.be.at.most(BALANCE_SCALE);
    expect(token0Only[4]).to.equal(0);

    const token1Only = await vaultMath.calculatePosition(
      sqrtPriceX96,
      0,
      BALANCE_SCALE,
    );
    expect(token1Only[1]).to.be.at.most(0);
    expect(token1Only[1] - token1Only[0]).to.equal(WIDTH);
    expect(token1Only[3]).to.equal(0);
    expect(token1Only[4]).to.be.at.most(BALANCE_SCALE);
  });

  for (const tick of [-100_000, 0, 100_000, 800_000, 886_271]) {
    it(`supports a balanced position at tick ${tick}`, async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(tick);
      const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1);

      expect(lower).to.be.lessThan(tick);
      expect(upper).to.be.greaterThan(tick);
      expect(upper - lower).to.equal(WIDTH);
      expect(liquidity).to.be.greaterThan(0);
      expect(used0).to.be.at.most(amount0);
      expect(used1).to.be.at.most(amount1);
    });
  }

  it("moves the range in the expected direction for skewed balances", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(-100_000);
    const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);

    const balanced = await vaultMath.calculatePosition(
      sqrtPriceX96,
      amount0,
      amount1,
    );
    const token0Heavy = await vaultMath.calculatePosition(
      sqrtPriceX96,
      amount0 * 100n,
      amount1,
    );
    const token1Heavy = await vaultMath.calculatePosition(
      sqrtPriceX96,
      amount0,
      amount1 * 100n,
    );

    expect(token0Heavy[0]).to.be.greaterThan(balanced[0]);
    expect(token1Heavy[0]).to.be.lessThan(balanced[0]);
  });

  it("rejects ranges where the standard LiquidityAmounts helper rounds liquidity to zero", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(-800_000);
    const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);

    await expect(
      vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1),
    ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
  });
});
