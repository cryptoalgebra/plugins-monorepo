import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("VaultMath", function () {
  const WIDTH = 100n;
  const Q192 = 1n << 192n;
  const BALANCE_SCALE = 10n ** 12n;

  async function deployFixture() {
    const MockFactory = await ethers.getContractFactory("MockFactory");
    const factory = await MockFactory.deploy();

    const VaultMath = await ethers.getContractFactory("VaultMath");
    const vaultMath = await VaultMath.deploy(factory.target, WIDTH);

    const VaultMathTestHelper = await ethers.getContractFactory(
      "VaultMathTestHelper",
    );
    const helper = await VaultMathTestHelper.deploy();

    return { vaultMath, helper };
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
