import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodePriceSqrt } from "@cryptoalgebra/test-utils/utilities";

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

  function expectOneSideNearlyFullyUsed(
    amount0: bigint,
    amount1: bigint,
    used0: bigint,
    used1: bigint,
  ) {
    const tolerance0 = amount0 / 1_000_000n + 10n;
    const tolerance1 = amount1 / 1_000_000n + 10n;
    expect(
      amount0 - used0 <= tolerance0 || amount1 - used1 <= tolerance1,
    ).to.equal(true);
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

  describe("minimum full-range mint amounts for 6/18 decimal pairs", function () {
    const cases = [
      { label: "0.01", priceNumerator: 1n, priceDenominator: 100n, token0Raw: 10_000_001n, token1Raw: 10_000_000n },
      { label: "1", priceNumerator: 1n, priceDenominator: 1n, token0Raw: 1_000_001n, token1Raw: 1_000_000n },
      { label: "1000", priceNumerator: 1_000n, priceDenominator: 1n, token0Raw: 31_623n, token1Raw: 31_623n },
      { label: "10000", priceNumerator: 10_000n, priceDenominator: 1n, token0Raw: 10_000n, token1Raw: 10_000n },
    ];

    for (const testCase of cases) {
      it(`requires minimum rounded-up amounts at ${testCase.label} USDC per token`, async function () {
        const { helper } = await loadFixture(deployFixture);

        // token0 has 18 decimals; token1 is USDC with 6 decimals.
        const sqrtPriceX96 = encodePriceSqrt(
          testCase.priceNumerator * 10n ** 6n,
          testCase.priceDenominator * 10n ** 18n,
        );
        const [amount0, amount1] = await helper.getFullRangeMintAmounts(sqrtPriceX96, 1);

        expect(amount0).to.equal(testCase.token0Raw);
        expect(amount1).to.equal(1n); // one micro-USDC
      });

      it(`handles reversed token order at ${testCase.label} USDC per token`, async function () {
        const { helper } = await loadFixture(deployFixture);

        // token0 is USDC; token1 has 18 decimals.
        const sqrtPriceX96 = encodePriceSqrt(
          testCase.priceDenominator * 10n ** 18n,
          testCase.priceNumerator * 10n ** 6n,
        );
        const [amount0, amount1] = await helper.getFullRangeMintAmounts(sqrtPriceX96, 1);

        expect(amount0).to.equal(1n); // one micro-USDC
        expect(amount1).to.equal(testCase.token1Raw);
      });
    }
  });

  it("preserves balance bounds and uses a limiting side across a bounded input grid", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const ticks = [-500_000, -100_000, -1, 0, 1, 100_000, 500_000];
    const multipliers = [1n, 2n, 5n, 10n, 100n];

    for (const tick of ticks) {
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(tick);
      const balanced = balancedRawAmounts(sqrtPriceX96);

      for (const amount0Multiplier of multipliers) {
        for (const amount1Multiplier of multipliers) {
          const amount0 = balanced.amount0 * amount0Multiplier;
          const amount1 = balanced.amount1 * amount1Multiplier;
          const [lower, upper, liquidity, used0, used1] =
            await vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1);

          // The most liquid placement may be a tight one-sided range with the price
          // exactly on a boundary; then only the corresponding single token is used.
          expect(lower).to.be.at.most(tick);
          expect(upper).to.be.at.least(tick);
          if (lower === BigInt(tick)) expect(used1).to.equal(0n);
          if (upper === BigInt(tick)) expect(used0).to.equal(0n);
          expect(upper - lower).to.equal(WIDTH);
          expect(liquidity).to.be.greaterThan(0);
          expect(used0).to.be.at.most(amount0);
          expect(used1).to.be.at.most(amount1);
          expectOneSideNearlyFullyUsed(amount0, amount1, used0, used1);
        }
      }
    }
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

  describe("dust balances select tight one-sided placements", function () {
    const DUST = 10n;

    async function midTickPrice(helper: any) {
      const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
      const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
      return (sqrtAt0 + sqrtAt1) / 2n;
    }

    it("ignores token1 dust between ticks and deploys token0 above the price", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtMid = await midTickPrice(helper);
      const { amount0 } = balancedRawAmounts(sqrtMid);

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtMid, amount0, DUST);

      // Tight token0-only placement: the range starts at ceil(price), the dust is left idle.
      expect(lower).to.equal(1n);
      expect(upper - lower).to.equal(WIDTH);
      expect(used1).to.equal(0n);
      expect(amount0 - used0).to.be.at.most(amount0 / 1_000_000n + 10n);
      expect(liquidity).to.equal(
        await helper.getLiquidityForAmounts(sqrtMid, 1n, 1n + WIDTH, amount0, 0n),
      );
    });

    it("ignores token0 dust between ticks and deploys token1 below the price", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtMid = await midTickPrice(helper);
      const { amount1 } = balancedRawAmounts(sqrtMid);

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtMid, DUST, amount1);

      // Tight token1-only placement: the range ends at floor(price).
      expect(upper).to.equal(0n);
      expect(lower).to.equal(-WIDTH);
      expect(used0).to.equal(0n);
      expect(amount1 - used1).to.be.at.most(amount1 / 1_000_000n + 10n);
      expect(liquidity).to.equal(
        await helper.getLiquidityForAmounts(sqrtMid, -WIDTH, 0n, 0n, amount1),
      );
    });

    it("puts the boundary exactly on an on-tick price for token1 dust", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);
      const { amount0 } = balancedRawAmounts(sqrtPriceX96);

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtPriceX96, amount0, DUST);

      // Price exactly on the lower boundary is a valid pure-token0 placement.
      expect(lower).to.equal(0n);
      expect(upper).to.equal(WIDTH);
      expect(used1).to.equal(0n);
      expect(amount0 - used0).to.be.at.most(amount0 / 1_000_000n + 10n);
      expect(liquidity).to.equal(
        await helper.getLiquidityForAmounts(sqrtPriceX96, 0n, WIDTH, amount0, 0n),
      );
    });

    it("puts the boundary exactly on an on-tick price for token0 dust", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);
      const { amount1 } = balancedRawAmounts(sqrtPriceX96);

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtPriceX96, DUST, amount1);

      // Price exactly on the upper boundary is a valid pure-token1 placement.
      expect(upper).to.equal(0n);
      expect(lower).to.equal(-WIDTH);
      expect(used0).to.equal(0n);
      expect(amount1 - used1).to.be.at.most(amount1 / 1_000_000n + 10n);
      expect(liquidity).to.equal(
        await helper.getLiquidityForAmounts(sqrtPriceX96, -WIDTH, 0n, 0n, amount1),
      );
    });

    it("keeps a two-sided position for moderate imbalance", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtMid = await midTickPrice(helper);
      const balanced = balancedRawAmounts(sqrtMid);
      // 2% of value on token1 is several times the sub-tick sliver threshold (~0.5% for a
      // mid-tick price), so the two-sided placement must stay strictly around the price.
      const amount1 = balanced.amount1 / 50n;

      const [lower, upper, , used0, used1] =
        await vaultMath.calculatePosition(sqrtMid, balanced.amount0, amount1);

      const sqrtLower = await helper.getSqrtRatioAtTick(lower);
      const sqrtUpper = await helper.getSqrtRatioAtTick(upper);
      expect(sqrtLower).to.be.lessThan(sqrtMid);
      expect(sqrtUpper).to.be.greaterThan(sqrtMid);
      expect(used0).to.be.greaterThan(0n);
      expect(used1).to.be.greaterThan(0n);
    });

    it("never picks a range less liquid than one-sided placements or neighbours across dust magnitudes", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);

      for (const baseTick of [-100_000n, 0n, 100_000n]) {
        const sqrtA = await helper.getSqrtRatioAtTick(baseTick);
        const sqrtB = await helper.getSqrtRatioAtTick(baseTick + 1n);
        const sqrtPriceX96 = sqrtA + ((sqrtB - sqrtA) * 25n) / 100n;
        const balanced = balancedRawAmounts(sqrtPriceX96);

        for (const dust of [1n, 100n, 10n ** 6n, 10n ** 9n]) {
          for (const dustSide of [0, 1]) {
            const amount0 = dustSide === 0 ? dust : balanced.amount0;
            const amount1 = dustSide === 0 ? balanced.amount1 : dust;

            const [lower, upper, liquidity, used0, used1] =
              await vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1);

            expect(upper - lower).to.equal(WIDTH);
            expect(liquidity).to.be.greaterThan(0n);
            expect(used0).to.be.at.most(amount0);
            expect(used1).to.be.at.most(amount1);

            // The result is never less liquid than the tight one-sided placements or the
            // immediate neighbours, restricted to the allowed window around the price.
            const candidates = [baseTick + 1n, baseTick - WIDTH, lower - 1n, lower + 1n];
            for (const candidate of candidates) {
              if (candidate < baseTick - WIDTH || candidate > baseTick + 1n) continue;
              const candidateLiquidity = await helper.getLiquidityForAmounts(
                sqrtPriceX96,
                candidate,
                candidate + WIDTH,
                amount0,
                amount1,
              );
              expect(liquidity).to.be.at.least(candidateLiquidity);
            }
          }
        }
      }
    });

    it("regression: live vault dust state deploys the dominant token", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      await vaultMath.setPositionWidth(3640);

      // Base Sepolia incident: ~49,598.58 USDC idle against 13036 wei of token1, price ~6% of a
      // tick above 197904. The dust used to force a two-sided mint of only ~220k liquidity.
      const sqrtAtTick = await helper.getSqrtRatioAtTick(197_904);
      const sqrtAtNext = await helper.getSqrtRatioAtTick(197_905);
      const sqrtPriceX96 = sqrtAtTick + ((sqrtAtNext - sqrtAtTick) * 6n) / 100n;
      const amount0 = 49_598_584_404n;
      const amount1 = 13_036n;

      const [lower, upper, liquidity, used0, used1] =
        await vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1);

      expect(lower).to.equal(197_905n);
      expect(upper).to.equal(197_905n + 3_640n);
      expect(used1).to.equal(0n);
      expect(amount0 - used0).to.be.at.most(amount0 / 1_000n);
      expect(liquidity).to.equal(
        await helper.getLiquidityForAmounts(sqrtPriceX96, 197_905n, 197_905n + 3_640n, amount0, 0n),
      );
      // Ten orders of magnitude above the dust-throttled two-sided result.
      expect(liquidity).to.be.greaterThan(10n ** 15n);
    });
  });

  it("selects a range at least as liquid as either neighboring lower tick", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(-100_000);
    const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);
    const [lower, , liquidity] = await vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1);

    const previousLiquidity = await helper.getLiquidityForAmounts(
      sqrtPriceX96,
      lower - 1n,
      lower - 1n + WIDTH,
      amount0,
      amount1,
    );
    const nextLiquidity = await helper.getLiquidityForAmounts(
      sqrtPriceX96,
      lower + 1n,
      lower + 1n + WIDTH,
      amount0,
      amount1,
    );

    expect(liquidity).to.be.at.least(previousLiquidity);
    expect(liquidity).to.be.at.least(nextLiquidity);
  });

  it("rejects ranges where the standard LiquidityAmounts helper rounds liquidity to zero", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(-800_000);
    const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);

    await expect(
      vaultMath.calculatePosition(sqrtPriceX96, amount0, amount1),
    ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
  });

  it("reverts at geometrically impossible endpoints", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);

    // token0-only cannot fit a width-WIDTH range above a tick beyond MAX_TICK - width.
    const highTick = 887_172 + 50;
    const sqrtHigh = await helper.getSqrtRatioAtTick(highTick);
    await expect(
      vaultMath.calculatePosition(sqrtHigh, BALANCE_SCALE, 0),
    ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");

    // token1-only cannot fit a width-WIDTH range below a tick beyond MIN_TICK + width.
    const lowTick = -887_172 - 50;
    const sqrtLow = await helper.getSqrtRatioAtTick(lowTick);
    await expect(
      vaultMath.calculatePosition(sqrtLow, 0, BALANCE_SCALE),
    ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");

    // Two-sided: no range can contain the price strictly inside at exactly MIN_TICK.
    const sqrtMin = await helper.getSqrtRatioAtTick(-887_272);
    await expect(
      vaultMath.calculatePosition(sqrtMin, BALANCE_SCALE, BALANCE_SCALE),
    ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
  });

  it("handles prices between ticks for one-sided balances", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
    const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
    const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;

    // token0-only: the lower tick is ceil(price), i.e. one tick above the current tick.
    const token0 = await vaultMath.calculatePosition(sqrtMid, BALANCE_SCALE, 0);
    expect(token0[0]).to.equal(1n);
    expect(token0[1] - token0[0]).to.equal(WIDTH);
    expect(token0[4]).to.equal(0);

    // token1-only: the upper tick is floor(price), i.e. the current tick.
    const token1 = await vaultMath.calculatePosition(sqrtMid, 0, BALANCE_SCALE);
    expect(token1[1]).to.equal(0n);
    expect(token1[1] - token1[0]).to.equal(WIDTH);
    expect(token1[3]).to.equal(0);
  });

  it("handles prices between ticks for two-sided balances", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
    const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
    const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;
    const { amount0, amount1 } = balancedRawAmounts(sqrtMid);

    const [lower, upper, liquidity, used0, used1] =
      await vaultMath.calculatePosition(sqrtMid, amount0, amount1);

    expect(upper - lower).to.equal(WIDTH);
    expect(liquidity).to.be.greaterThan(0);
    expect(used0).to.be.at.most(amount0);
    expect(used1).to.be.at.most(amount1);

    // Strict sqrt-price containment is the exact check for off-tick prices.
    const sqrtLower = await helper.getSqrtRatioAtTick(lower);
    const sqrtUpper = await helper.getSqrtRatioAtTick(upper);
    expect(sqrtLower).to.be.lessThan(sqrtMid);
    expect(sqrtMid).to.be.lessThan(sqrtUpper);
  });

  it("applies an updated position width to calculations", async function () {
    const { vaultMath, helper } = await loadFixture(deployFixture);
    await vaultMath.setPositionWidth(3000);

    const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);
    const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);
    const [lower, upper, liquidity] = await vaultMath.calculatePosition(
      sqrtPriceX96,
      amount0,
      amount1,
    );

    expect(upper - lower).to.equal(3000n);
    expect(lower).to.be.lessThan(0);
    expect(upper).to.be.greaterThan(0);
    expect(liquidity).to.be.greaterThan(0);
  });
});
