import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fc from 'fast-check';

// Fixed seed so a green run stays green and a failure is reproducible.
const fuzz = {
  seed: Number(process.env.FUZZ_SEED ?? 20260903),
  numRuns: Number(process.env.FUZZ_RUNS ?? 200),
};

const MIN_TICK = -887272;
const MAX_TICK = 887272;

const tickArb = fc.integer({ min: MIN_TICK, max: MAX_TICK });

// Mixed scales. Short deltas are the common case, but the arithmetic is unchecked and the
// squares grow with the cube of dt, so the top of the uint32 range has to be drawn too.
const dtArb = fc.oneof(
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 1_000_000 }),
  fc.integer({ min: 1, max: 4_294_967_295 })
);

describe('VolatilityOracle properties', function () {
  async function volatilityOracleFixture() {
    return (await (await ethers.getContractFactory('VolatilityOracleTest')).deploy()) as any;
  }

  // _volatilityOnRange sums the squared distance between the tick line and the average tick line
  // over dt seconds. Everything below follows from that being a sum of squares of a linear
  // function, which is what the implementation is entitled to assume.
  describe('#volatilityOnRange', function () {
    it('is unchanged when every tick shifts by the same amount', async function () {
      const oracle = await loadFixture(volatilityOracleFixture);

      await fc.assert(
        fc.asyncProperty(dtArb, tickArb, tickArb, tickArb, tickArb, fc.nat(), async (dt, t0, t1, a0, a1, shiftSeed) => {
          const low = Math.min(t0, t1, a0, a1);
          const high = Math.max(t0, t1, a0, a1);
          // pick a shift that keeps all four inside the tick range
          const room = MAX_TICK - high + (low - MIN_TICK);
          const shift = room === 0 ? 0 : (shiftSeed % (room + 1)) - (low - MIN_TICK);

          const base = await oracle.volatilityOnRange(dt, t0, t1, a0, a1);
          const shifted = await oracle.volatilityOnRange(dt, t0 + shift, t1 + shift, a0 + shift, a1 + shift);

          expect(shifted).to.equal(base);
        }),
        fuzz
      );
    });

    it('is unchanged when every tick flips sign', async function () {
      const oracle = await loadFixture(volatilityOracleFixture);

      await fc.assert(
        fc.asyncProperty(dtArb, tickArb, tickArb, tickArb, tickArb, async (dt, t0, t1, a0, a1) => {
          const base = await oracle.volatilityOnRange(dt, t0, t1, a0, a1);

          expect(await oracle.volatilityOnRange(dt, -t0, -t1, -a0, -a1)).to.equal(base);
        }),
        fuzz
      );
    });

    it('is unchanged when the tick line and the average line swap places', async function () {
      const oracle = await loadFixture(volatilityOracleFixture);

      await fc.assert(
        fc.asyncProperty(dtArb, tickArb, tickArb, tickArb, tickArb, async (dt, t0, t1, a0, a1) => {
          // swapping the pairs negates the deviation, and the deviation only appears squared
          const base = await oracle.volatilityOnRange(dt, t0, t1, a0, a1);

          expect(await oracle.volatilityOnRange(dt, a0, a1, t0, t1)).to.equal(base);
        }),
        fuzz
      );
    });

    it('never exceeds dt times the larger endpoint deviation squared', async function () {
      const oracle = await loadFixture(volatilityOracleFixture);

      await fc.assert(
        fc.asyncProperty(dtArb, tickArb, tickArb, tickArb, tickArb, async (dt, t0, t1, a0, a1) => {
          const start = BigInt(t0 - a0);
          const end = BigInt(t1 - a1);
          // the deviation is linear in t, so its magnitude peaks at one end of the interval
          const peak = start * start > end * end ? start * start : end * end;

          expect(await oracle.volatilityOnRange(dt, t0, t1, a0, a1)).to.be.lte(BigInt(dt) * peak);
        }),
        fuzz
      );
    });

    it('returns exactly dt times the square of a deviation that never moves', async function () {
      const oracle = await loadFixture(volatilityOracleFixture);

      await fc.assert(
        fc.asyncProperty(dtArb, tickArb, tickArb, tickArb, async (dt, t0, t1, a0) => {
          // hold the deviation constant across the interval, so every term of the sum is the same
          const deviation = BigInt(t0 - a0);
          const a1 = t1 - (t0 - a0);

          const result = await oracle.volatilityOnRange(dt, t0, t1, a0, a1);

          expect(result).to.equal(BigInt(dt) * deviation * deviation);
        }),
        fuzz
      );
    });
  });
});
