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

// Aimed at both sides of beta on purpose. sigmoidInputArb above feeds only the arm above beta, which
// is where the alpha bound is tight, and leaves the other arm to its uniform fallback.
const twoSidedSigmoidInputArb = fc.oneof(
  {
    weight: 4,
    arbitrary: fc
      .tuple(gammaArb, fc.integer({ min: 1_000_000, max: 2_000_000 }), fc.integer({ min: -6_000_000, max: 6_000_000 }))
      .map(([gamma, beta, sixths]) => ({ gamma, beta, x: beta + Math.trunc((gamma * sixths) / 1_000_000) })),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(gammaArb, fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 4_000_000 }))
      .map(([gamma, beta, x]) => ({ gamma, beta, x })),
  }
);

// Same shape as the two sided draw, with gamma held above the smallest one the shipped configuration
// uses, so the series is resolved well enough to compare against the curve itself.
const resolvedSigmoidInputArb = fc
  .tuple(fc.integer({ min: 59, max: 65535 }), fc.integer({ min: 1_000_000, max: 2_000_000 }), fc.integer({ min: -6_000_000, max: 6_000_000 }))
  .map(([gamma, beta, sixths]) => ({ gamma, beta, x: beta + Math.trunc((gamma * sixths) / 1_000_000) }));

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

  // The bound the property below asserts is tight at x == beta and slack everywhere else, so both
  // halves of the sigmoid have to be drawn around beta rather than uniformly. Replaying the earlier
  // one-sided generator at the committed seed put 6 draws in 600 into the arm below beta, and the
  // res <= alpha bound is trivially satisfied there anyway, since the true value cannot pass alpha/2.
  it('sits on the correct side of half its alpha', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(twoSidedSigmoidInputArb, fc.integer({ min: 0, max: 65535 }), async ({ x, gamma, beta }, alpha) => {
        const half = BigInt(alpha) / 2n;
        const result = await adaptiveFee.sigmoid(x, gamma, alpha, beta);

        // exactly alpha/2 at the shift, and monotone away from it in both directions
        if (x >= beta) expect(result).to.be.gte(half);
        if (x <= beta) expect(result).to.be.lte(half);
      }),
      { ...fuzz, numRuns: fuzz.numRuns * 4 }
    );
  });

  // A true logistic is symmetric about its shift, so the two sides have to add back up to alpha. What
  // this pins is that both arms divide one and the same exponential consistently: an off by one in
  // either arm alone breaks it. It is not a check on the numbers themselves, since the two arms read
  // the same table entry and a wrong entry cancels out of the sum. The reference property below is
  // what covers that.
  it('is symmetric about its shift', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(
        gammaArb,
        fc.integer({ min: 1_000_000, max: 2_000_000 }),
        fc.integer({ min: 0, max: 6_000_000 }),
        fc.integer({ min: 1, max: 65535 }),
        async (gamma, beta, sixths, alpha) => {
          const offset = Math.trunc((gamma * sixths) / 1_000_000);

          const above = await adaptiveFee.sigmoid(beta + offset, gamma, alpha, beta);
          const below = await adaptiveFee.sigmoid(beta - offset, gamma, alpha, beta);

          // Two truncating divisions and a series that is only claimed accurate below x/gamma = 6, so
          // the pair is allowed to land one unit short of alpha rather than exactly on it. Measured
          // over seven seeds the worst gap was 1.
          expect(above + below).to.be.gte(BigInt(alpha) - 1n);
          expect(above + below).to.be.lte(BigInt(alpha));
        }
      ),
      { ...fuzz, numRuns: fuzz.numRuns * 4 }
    );
  });

  // The only property here that compares against something other than the contract's own shape. The
  // library documents the curve it approximates, so a floating point reference catches what the
  // structural properties cannot: a wrong constant in expXg4's table cancels out of the symmetry sum
  // and leaves every bound intact.
  // The band is measured, and so is the gamma floor. expXg4 switches its table entry on x/gamma and
  // corrects with x mod gamma, so a tiny gamma leaves the series almost no resolution: over six seeds
  // and 3600 draws the worst gap against the reference is 6.9% of alpha with gamma drawn from 1, 1.0%
  // from 10, and 0.25% from 59 up. 59 is the smaller of the two gammas in the shipped default
  // configuration, so that is where the reference is worth holding the contract to. The worst case at
  // that floor is the saturation shortcut, which answers exactly alpha where the true curve is at
  // 0.9975 of it.
  it('tracks the logistic it is documented to approximate', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(resolvedSigmoidInputArb, fc.integer({ min: 0, max: 65535 }), async ({ x, gamma, beta }, alpha) => {
        const reference = alpha / (1 + Math.exp((beta - x) / gamma));

        const result = Number(await adaptiveFee.sigmoid(x, gamma, alpha, beta));

        // the trailing unit is the truncating division, which dominates when alpha is small
        expect(Math.abs(result - reference)).to.be.lte((alpha * 5) / 1000 + 1);
      }),
      { ...fuzz, numRuns: fuzz.numRuns * 4 }
    );
  });

  // getFee opens by dividing the volatility by 15 to normalize it to that interval, so the fee is
  // constant across each 15 wide bucket. Nothing pinned that, and it is the one place a change to the
  // normalization would show up without changing any bound.
  it('quotes one fee per fifteen units of volatility', async function () {
    const adaptiveFee = await loadFixture(adaptiveFeeFixture);

    await fc.assert(
      fc.asyncProperty(feeConfigArb, volatilityArb, async (config, volatility) => {
        await adaptiveFee.setFeeConfig(config);

        const bucketStart = volatility - (volatility % 15n);

        expect(await adaptiveFee.getFee(volatility)).to.equal(await adaptiveFee.getFee(bucketStart));
      }),
      fuzz
    );
  });
});
