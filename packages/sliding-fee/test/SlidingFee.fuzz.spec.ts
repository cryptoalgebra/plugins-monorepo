import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture } from 'test-utils/beaconPlugin';
import fc from 'fast-check';

// Fixed seed so a green run stays green and a failure is reproducible.
const fuzz = {
  seed: Number(process.env.FUZZ_SEED ?? 20260903),
  numRuns: Number(process.env.FUZZ_RUNS ?? 100),
};

const MIN_TICK = -887272;
const MAX_TICK = 887272;
const FEE_FACTOR_SHIFT = 96n;
// the two factors start at one each and every branch of _calculateFeeFactors moves them together
const FACTOR_SUM = 2n << FEE_FACTOR_SHIFT;

// Draw the tick delta rather than two independent ticks. Two uniform draws over the whole range
// are almost always far enough apart that the squared price ratio dwarfs the factor and every swap
// lands in one of the two clamps, leaving the branch that moves the factors together unexercised.
// With that branch broken on purpose, the uniform version missed it entirely on some seeds even at
// 400 runs, while the delta version below catches it within the committed count on every seed tried.
const swapArb = fc
  .record({
    zeroToOne: fc.boolean(),
    lastTick: fc.integer({ min: MIN_TICK, max: MAX_TICK }),
    delta: fc.oneof(
      fc.integer({ min: -10, max: 10 }),
      fc.integer({ min: -1_000, max: 1_000 }),
      fc.integer({ min: -100_000, max: 100_000 })
    ),
    priceChangeFactor: fc.integer({ min: 0, max: 65535 }),
  })
  .map((swap) => ({ ...swap, currentTick: Math.min(MAX_TICK, Math.max(MIN_TICK, swap.lastTick + swap.delta)) }));

describe('SlidingFee properties', function () {
  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableSlidingFeePluginTest',
      setup: async ({ mockPool }) => {
        const slidingFeeImpl = await (await ethers.getContractFactory('SlidingFeePluginImplementation')).deploy();
        return { pluginArgs: [slidingFeeImpl.target], initArgs: [mockPool.target, 3000] };
      },
    });
  }

  it('keeps the two fee factors complementary through any sequence of swaps', async function () {
    await fc.assert(
      fc.asyncProperty(fc.array(swapArb, { minLength: 1, maxLength: 8 }), async (swaps) => {
        // a fresh fixture per run, so one sequence cannot inherit the factors another left behind
        const { plugin1 } = await loadFixture(deployFixture);

        for (const swap of swaps) {
          await plugin1.setPriceChangeFactor(swap.priceChangeFactor);
          await plugin1.getFeeForSwap(swap.zeroToOne, swap.lastTick, swap.currentTick);

          // Nothing in the contract enforces this. Every branch of _calculateFeeFactors happens to
          // move the two factors by the same amount in opposite directions, and the clamped
          // branches write a pair that also sums to the same constant.
          const [zeroToOne, oneToZero] = await plugin1.feeFactors();
          expect(zeroToOne + oneToZero).to.equal(FACTOR_SUM);
        }
      }),
      fuzz
    );
  });

  it('quotes the base fee shifted by the factor of the direction being swapped, clamped at both ends', async function () {
    await fc.assert(
      fc.asyncProperty(fc.array(swapArb, { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 65535 }), async (swaps, baseFee) => {
        const { plugin1 } = await loadFixture(deployFixture);
        await plugin1.setBaseFee(baseFee);

        for (const swap of swaps) {
          await plugin1.setPriceChangeFactor(swap.priceChangeFactor);
          await plugin1.getFeeForSwap(swap.zeroToOne, swap.lastTick, swap.currentTick);

          // The fee is quoted from the factors as they stand after the update, so reading them back
          // gives the exact inputs the contract used. Asserting a bound instead would be vacuous on
          // the upper end, since lastFee is a uint16 and cannot report an overflow in the first place.
          const [zeroToOneFactor, oneToZeroFactor] = await plugin1.feeFactors();
          const shifted = (BigInt(baseFee) * (swap.zeroToOne ? zeroToOneFactor : oneToZeroFactor)) >> FEE_FACTOR_SHIFT;
          const expected = shifted > 65535n ? 65535n : shifted === 0n ? 1n : shifted;

          expect(await plugin1.lastFee()).to.equal(expected);
        }
      }),
      fuzz
    );
  });
});
