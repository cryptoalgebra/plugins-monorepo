import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fc from 'fast-check';

// Every property runs from a fixed seed, so a green run stays green tomorrow and a failure is
// reproducible. FUZZ_SEED and FUZZ_RUNS widen the search by hand without touching the file.
const fuzz = {
  seed: Number(process.env.FUZZ_SEED ?? 20260903),
  numRuns: Number(process.env.FUZZ_RUNS ?? 150),
};

// alpha1 + alpha2 + baseFee has to fit in a uint16 and both gammas have to be non zero.
// validateFeeConfiguration rejects anything else, so only generate what production would accept:
// a rejected config would test the guard, not the math behind it.
const feeConfigArb = fc
  .record({
    baseFee: fc.integer({ min: 0, max: 3000 }),
    alpha1: fc.integer({ min: 0, max: 65535 }),
    alpha2: fc.integer({ min: 0, max: 65535 }),
    beta1: fc.integer({ min: 0, max: 200000 }),
    beta2: fc.integer({ min: 0, max: 200000 }),
    gamma1: fc.integer({ min: 1, max: 65535 }),
    gamma2: fc.integer({ min: 1, max: 65535 }),
  })
  .map((config) => {
    const room = 65535 - config.baseFee;
    const sum = config.alpha1 + config.alpha2;
    if (sum <= room) return config;
    // scale the two alphas down together rather than clamping one, which would bias every
    // oversized draw towards the same shape
    const alpha1 = Math.floor((config.alpha1 * room) / sum);
    return { ...config, alpha1, alpha2: room - alpha1 };
  });

// Mixed scales on purpose. A uniform draw over the whole uint88 is astronomically large every
// time, saturates both sigmoids, and would test one branch over and over.
const volatilityArb = fc.oneof(
  fc.bigInt({ min: 0n, max: 30_000n }),
  fc.bigInt({ min: 0n, max: 4_000_000n }),
  fc.bigInt({ min: 0n, max: (1n << 88n) - 1n })
);

// The sigmoid bound only binds near saturation, which is where x sits a few gammas above beta.
// A uniform x almost never lands there: with an off by one planted in that branch, a uniform draw
// needed 20000 runs to notice it and the shaped draw below notices inside the committed 150.
const gammaArb = fc.integer({ min: 1, max: 65535 });
const sigmoidInputArb = fc.oneof(
  {
    weight: 4,
    arbitrary: fc
      .tuple(gammaArb, fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 6_000_000 }))
      .map(([gamma, beta, sixths]) => ({ gamma, beta, x: beta + Math.trunc((gamma * sixths) / 1_000_000) })),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(gammaArb, fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 4_000_000 }))
      .map(([gamma, beta, x]) => ({ gamma, beta, x })),
  }
);

describe('AdaptiveFee properties', function () {
  async function adaptiveFeeFixture() {
    return (await (await ethers.getContractFactory('AdaptiveFeePropertiesTest')).deploy()) as any;
  }

  it('never returns a fee outside the band its own config defines', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(feeConfigArb, volatilityArb, async (config, volatility) => {
        await adaptiveFee.setFeeConfig(config);

        const fee = await adaptiveFee.getFee(volatility);

        expect(fee).to.be.gte(config.baseFee);
        expect(fee).to.be.lte(config.baseFee + config.alpha1 + config.alpha2);
      }),
      fuzz
    );
  });

  it('never lowers the fee as volatility rises', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(feeConfigArb, fc.array(volatilityArb, { minLength: 2, maxLength: 12 }), async (config, draws) => {
        await adaptiveFee.setFeeConfig(config);
        const ladder = [...draws].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        // The sigmoid is increasing in x, but getFee reaches it through a truncated series with
        // table values that switch at multiples of gamma. Monotonicity is what could break there.
        let previous = 0n;
        for (const volatility of ladder) {
          const fee = await adaptiveFee.getFee(volatility);
          expect(fee).to.be.gte(previous);
          previous = fee;
        }
      }),
      fuzz
    );
  });

  it('keeps every sigmoid at or below its alpha', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(sigmoidInputArb, fc.integer({ min: 0, max: 65535 }), async ({ x, gamma, beta }, alpha) => {
        // The library documents this as a guarantee, and getFee relies on it: the sum of the two
        // sigmoids plus baseFee is asserted to fit in a uint16.
        expect(await adaptiveFee.sigmoid(x, gamma, alpha, beta)).to.be.lte(alpha);
      }),
      // This one is a plain read rather than a transaction, so runs are cheap and it gets four
      // times as many. With an off by one planted in the first branch, six seeds needed between
      // 17 and 115 draws to notice it, which is close enough to the shared default to be luck.
      { ...fuzz, numRuns: fuzz.numRuns * 4 }
    );
  });
});
