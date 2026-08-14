import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodePriceSqrt } from "@cryptoalgebra/test-utils/utilities";

describe("VaultMath", function () {
  const TICK_SPACING = 1n;
  const Q96 = 1n << 96n;
  const Q192 = 1n << 192n;
  const BALANCE_SCALE = 10n ** 12n;

  async function deployFixture() {
    const VaultMath = await ethers.getContractFactory("VaultMath");
    const vaultMath = await VaultMath.deploy();

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

  function dustTolerance(amount: bigint) {
    return amount / 1_000_000n + 10n;
  }

  it("rejects empty balances", async function () {
    const { vaultMath } = await loadFixture(deployFixture);

    await expect(
      vaultMath.calculatePosition(Q96, 0, 0),
    ).to.be.revertedWithCustomError(vaultMath, "ZeroAmounts");
  });

  describe("main position", function () {
    for (const tick of [-500_000, -1, 0, 1, 500_000]) {
      it(`sits on the single tick containing the price at tick ${tick}`, async function () {
        const { vaultMath, helper } = await loadFixture(deployFixture);
        const sqrtPriceX96 = await helper.getSqrtRatioAtTick(tick);
        const { amount0, amount1 } = balancedRawAmounts(sqrtPriceX96);

        const [main] = await vaultMath.calculatePosition(
          sqrtPriceX96,
          amount0,
          amount1,
        );

        expect(main.lower).to.equal(BigInt(tick));
        expect(main.upper).to.equal(BigInt(tick) + 1n);
      });
    }

    it("absorbs a token0-only deposit when the price sits exactly on the tick's lower bound", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);

      const [main, reserve] = await vaultMath.calculatePosition(
        sqrtPriceX96,
        BALANCE_SCALE,
        0,
      );

      expect(main.liquidity).to.be.greaterThan(0n);
      expect(main.used1).to.equal(0n);
      expect(BALANCE_SCALE - main.used0).to.be.at.most(
        dustTolerance(BALANCE_SCALE),
      );
      // Whatever rounding dust is left over is reported as used-nothing on the reserve.
      expect(reserve.used0).to.equal(0n);
      expect(reserve.used1).to.equal(0n);
    });

    it("uses none of a token1-only deposit when the price sits exactly on the tick's lower bound", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);

      const [main, reserve] = await vaultMath.calculatePosition(
        sqrtPriceX96,
        0,
        BALANCE_SCALE,
      );

      // Price at the lower bound is a pure-token0 boundary, so the main position can only
      // ever use token0; with none supplied its liquidity is exactly zero.
      expect(main.liquidity).to.equal(0n);
      expect(main.used0).to.equal(0n);
      expect(main.used1).to.equal(0n);
      // The entire deposit is routed to the reserve instead (see "reserve position" below).
      expect(reserve.used1).to.be.greaterThan(0n);
    });

    it("stays empty for a one-sided deposit when the price is strictly inside the tick", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
      const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
      const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;

      const [mainToken0] = await vaultMath.calculatePosition(
        sqrtMid,
        BALANCE_SCALE,
        0,
      );
      expect(mainToken0.liquidity).to.equal(0n);

      const [mainToken1] = await vaultMath.calculatePosition(
        sqrtMid,
        0,
        BALANCE_SCALE,
      );
      expect(mainToken1.liquidity).to.equal(0n);
    });

    it("uses both tokens for a balanced two-sided deposit", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
      const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
      const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;
      const { amount0, amount1 } = balancedRawAmounts(sqrtMid);

      const [main] = await vaultMath.calculatePosition(sqrtMid, amount0, amount1);

      expect(main.liquidity).to.be.greaterThan(0n);
      expect(main.used0).to.be.greaterThan(0n);
      expect(main.used1).to.be.greaterThan(0n);
      expect(main.used0).to.be.at.most(amount0);
      expect(main.used1).to.be.at.most(amount1);
    });
  });

  describe("reserve position", function () {
    it("is placed immediately above the main tick, spanning one tick, when token0 is left over", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
      const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
      const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;

      const [main, reserve] = await vaultMath.calculatePosition(
        sqrtMid,
        BALANCE_SCALE,
        0,
      );

      expect(reserve.lower).to.equal(main.upper);
      expect(reserve.upper - reserve.lower).to.equal(TICK_SPACING);
      expect(reserve.used1).to.equal(0n);
      expect(BALANCE_SCALE - reserve.used0).to.be.at.most(
        dustTolerance(BALANCE_SCALE),
      );
    });

    it("is placed immediately below the main tick, spanning one tick, when token1 is left over", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtAt0 = await helper.getSqrtRatioAtTick(0);
      const sqrtAt1 = await helper.getSqrtRatioAtTick(1);
      const sqrtMid = (sqrtAt0 + sqrtAt1) / 2n;

      const [main, reserve] = await vaultMath.calculatePosition(
        sqrtMid,
        0,
        BALANCE_SCALE,
      );

      expect(reserve.upper).to.equal(main.lower);
      expect(reserve.upper - reserve.lower).to.equal(TICK_SPACING);
      expect(reserve.used0).to.equal(0n);
      expect(BALANCE_SCALE - reserve.used1).to.be.at.most(
        dustTolerance(BALANCE_SCALE),
      );
    });

    it("picks the side with the larger leftover, not merely a nonzero one", async function () {
      // Regression: the fully-used side of the main position still carries a wei or two of
      // floor-rounding dust. Comparing that dust against zero (instead of against the other
      // side's leftover) used to strand the real leftover token undeployed.
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);

      const [main, reserve] = await vaultMath.calculatePosition(
        sqrtPriceX96,
        BALANCE_SCALE,
        BALANCE_SCALE,
      );

      // Price on the boundary drives the main position to a pure-token0 fill, so essentially
      // all of amount1 is leftover and must land in the reserve below the price.
      expect(main.used1).to.equal(0n);
      expect(reserve.upper).to.equal(main.lower);
      expect(BALANCE_SCALE - reserve.used1).to.be.at.most(
        dustTolerance(BALANCE_SCALE),
      );
    });

    it("stays empty (uses nothing) when the main position consumes both supplied amounts", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(0);

      // Feed back exactly what a prior call reported as used, so there is nothing left over.
      const [firstMain] = await vaultMath.calculatePosition(
        sqrtPriceX96,
        BALANCE_SCALE,
        BALANCE_SCALE,
      );
      const [, reserve] = await vaultMath.calculatePosition(
        sqrtPriceX96,
        firstMain.used0,
        firstMain.used1,
      );

      expect(reserve.used0).to.equal(0n);
      expect(reserve.used1).to.equal(0n);
    });

    it("reverts when it would extend past MAX_TICK", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      // One tick below MAX_TICK: the main position's upper bound reaches MAX_TICK exactly,
      // so the reserve tick above it is the one that overflows.
      const highTick = 887_272 - 1;
      const sqrtHigh = await helper.getSqrtRatioAtTick(highTick);

      await expect(
        vaultMath.calculatePosition(sqrtHigh, BALANCE_SCALE, 0),
      ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
    });

    it("reverts when it would extend past MIN_TICK", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      // At MIN_TICK exactly, the reserve tick below the main position's lower bound underflows.
      const lowTick = -887_272;
      const sqrtLow = await helper.getSqrtRatioAtTick(lowTick);

      await expect(
        vaultMath.calculatePosition(sqrtLow, 0, BALANCE_SCALE),
      ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
    });
  });

  describe("bounds and invariants", function () {
    it("never uses more than the supplied balances, across a grid of ticks and amount ratios", async function () {
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
            const [main, reserve] = await vaultMath.calculatePosition(
              sqrtPriceX96,
              amount0,
              amount1,
            );

            const totalUsed0 = main.used0 + reserve.used0;
            const totalUsed1 = main.used1 + reserve.used1;
            expect(totalUsed0).to.be.at.most(amount0);
            expect(totalUsed1).to.be.at.most(amount1);
            expect(main.liquidity > 0n || reserve.liquidity > 0n).to.equal(true);

            // Together the two positions use nearly all of at least one side.
            const remaining0 = amount0 - totalUsed0;
            const remaining1 = amount1 - totalUsed1;
            expect(
              remaining0 <= dustTolerance(amount0) ||
                remaining1 <= dustTolerance(amount1),
            ).to.equal(true);
          }
        }
      }
    });

    it("reverts when the supplied balance is too small to mint any liquidity at all", async function () {
      const { vaultMath, helper } = await loadFixture(deployFixture);
      // Deep out-of-the-money tick: price is tiny enough that even the reserve's wider range
      // rounds 1 wei of token0 down to zero liquidity, so nothing at all can be minted.
      const sqrtPriceX96 = await helper.getSqrtRatioAtTick(-400_000);

      await expect(
        vaultMath.calculatePosition(sqrtPriceX96, 1, 0),
      ).to.be.revertedWithCustomError(vaultMath, "InvalidPosition");
    });
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
});
