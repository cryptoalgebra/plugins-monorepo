import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ZERO_ADDRESS } from 'test-utils/consts';
import fc from 'fast-check';
import { rebalances } from './almRebalances.json';

// Fixed seed so a green run stays green and a failure is reproducible.
const fuzz = {
  seed: Number(process.env.FUZZ_SEED ?? 20260903),
  numRuns: Number(process.env.FUZZ_RUNS ?? 200),
};

const MIN_TICK = -887272n;
const MAX_TICK = 887272n;

// One recorded threshold set, used as the shape the generators vary around. Thresholds are
// constructor arguments, so varying them would mean a redeploy per draw.
const recorded = rebalances[0].state;
const thresholds = {
  depositTokenUnusedThreshold: recorded.depositTokenUnusedThreshold,
  simulate: recorded.simulateTrigger,
  normalThreshold: recorded.normalTrigger,
  underInventoryThreshold: recorded.underTrigger,
  overInventoryThreshold: recorded.overTrigger,
  priceChangeThreshold: recorded.priceChangeTrigger,
  extremeVolatility: recorded.extremeVolatility,
  highVolatility: recorded.highVolatility,
  someVolatility: recorded.someVolatility,
  dtrDelta: recorded.dtrDelta,
  baseLowPct: recorded.baseLowPct,
  baseHighPct: recorded.baseHighPct,
  limitReservePct: recorded.limitReservePct,
};

const BASE_PRICE = BigInt(recorded.currentPrice);
const TOTAL_LIQUIDITY = 10n ** 22n;

// The three prices decide which arm of _decideRebalance a draw lands in, and the arms are cut by
// fixed thresholds: someVolatility at 2%, highVolatility at 9%, extremeVolatility at 25%. Drawing a
// single band would test a single arm, so the four below straddle all three thresholds. The narrow
// band is weighted highest because it is the only one that reaches the range builder at all: drawn
// uniformly across a wide band instead, 1200 draws rebalanced 4 times against 1105 for the narrow one.
const bandArb = fc.oneof(
  { weight: 6, arbitrary: fc.constant(5_000_000) },
  { weight: 2, arbitrary: fc.constant(30_000_000) },
  { weight: 2, arbitrary: fc.constant(80_000_000) },
  { weight: 1, arbitrary: fc.constant(300_000_000) }
);

// how far into its band one price sits, as a signed fraction in parts per million
const offsetArb = fc.integer({ min: -1_000_000, max: 1_000_000 });
const priceIn = (band: number, offset: number) =>
  (BASE_PRICE * BigInt(1_000_000_000 + Math.trunc((band * offset) / 1_000_000))) / 1_000_000_000n;

const tickArb = (tickSpacing: number) =>
  fc.oneof(
    fc.integer({ min: -800_000, max: 800_000 }),
    // exact multiples matter: the range builder has a separate arm for a tick already on the grid
    fc.integer({ min: Math.trunc(-800_000 / tickSpacing), max: Math.trunc(800_000 / tickSpacing) }).map((n) => n * tickSpacing)
  );

const drawArb = (tickSpacing: number) =>
  fc.record({
    state: fc.integer({ min: 0, max: 3 }),
    lastRebalancePriceOffset: fc.oneof(fc.constant(null), offsetArb),
    band: bandArb,
    slowOffset: offsetArb,
    fastOffset: offsetArb,
    currentOffset: offsetArb,
    depositShare: fc.integer({ min: 0, max: 1_000_000 }),
    unusedShare: fc.integer({ min: 0, max: 1_000_000 }),
    currentTick: tickArb(tickSpacing),
    sameBlock: fc.boolean(),
  });

describe('AlmPlugin properties', function () {
  for (const [tickSpacing, allowToken0, allowToken1] of [
    [60, true, false],
    [60, false, true],
    [200, true, false],
    [1, false, true],
  ] as [number, boolean, boolean][]) {
    describe(`tickSpacing ${tickSpacing}, deposit token ${allowToken1 ? 'token1' : 'token0'}`, function () {
      async function deployFixture() {
        const mockVault = (await (await ethers.getContractFactory('MockVault')).deploy(ZERO_ADDRESS, true, false)) as any;
        await mockVault.setAllowTokens(allowToken0, allowToken1);

        const almPlugin = (await (
          await ethers.getContractFactory('AlmPluginTest')
        ).deploy(await mockVault.getAddress(), 7200, thresholds, tickSpacing)) as any;
        await almPlugin.setDecimals(18, 18);

        // the base reads authorization off the factory, and the throttle is a separate axis
        const mockFactory = await (await ethers.getContractFactory('MockFactory')).deploy();
        await almPlugin.setFactory(mockFactory.target);
        await almPlugin.setMinTimeBetweenRebalances(0);

        return { almPlugin, mockVault };
      }

      it('only ever hands the vault a well formed pair of ranges', async function () {
        const spacing = BigInt(tickSpacing);
        let rebalanced = 0;

        await fc.assert(
          fc.asyncProperty(drawArb(tickSpacing), async (draw) => {
            // A fresh fixture per draw. The extreme volatility arm calls _pause(), and a paused
            // plugin turns every later call into a no-op: without this, one early draw in that arm
            // silently emptied the rest of the run.
            const { almPlugin, mockVault } = await loadFixture(deployFixture);

            await almPlugin.setState(draw.state);
            await almPlugin.setLastRebalanceCurrentPrice(
              draw.lastRebalancePriceOffset === null ? 0n : priceIn(30_000_000, draw.lastRebalancePriceOffset)
            );
            await almPlugin.setPrices(
              priceIn(draw.band, draw.slowOffset),
              priceIn(draw.band, draw.fastOffset),
              priceIn(draw.band, draw.currentOffset)
            );
            const amount0 = (BigInt(draw.depositShare) * TOTAL_LIQUIDITY) / 1_000_000n;
            await mockVault.setTotalAmounts(amount0, TOTAL_LIQUIDITY - amount0);
            await almPlugin.setDepositTokenBalance((BigInt(draw.unusedShare) * TOTAL_LIQUIDITY) / 100_000_000n);

            const receipt = await (
              await almPlugin.rebalance(draw.currentTick, draw.currentTick, draw.currentTick, draw.sameBlock ? 1 : 0)
            ).wait();

            for (const log of receipt.logs) {
              let parsed: any;
              try {
                parsed = mockVault.interface.parseLog(log);
              } catch {
                continue;
              }
              if (parsed?.name !== 'MockRebalance') continue;
              rebalanced++;

              const [baseLower, baseUpper, limitLower, limitUpper] = parsed.args.map((tick: any) => BigInt(tick));

              // The contract applies one guard before this call: a range narrower than 300 ticks is
              // skipped, which incidentally rejects an inverted one too. Transposing the OverInventory
              // swap is absorbed by it and emits nothing at all. So the two ordering assertions are a
              // backstop for that guard, and it is alignment and the tick bounds that carry weight
              // here: the builder adds or subtracts a spacing in a dozen places and nothing checks it.
              expect(baseLower).to.be.lessThan(baseUpper);
              expect(limitLower).to.be.lessThan(limitUpper);
              for (const tick of [baseLower, baseUpper, limitLower, limitUpper]) {
                expect(tick).to.be.gte(MIN_TICK);
                expect(tick).to.be.lte(MAX_TICK);
                expect(((tick % spacing) + spacing) % spacing).to.equal(0n);
              }
            }
          }),
          fuzz
        );

        // A draw that does not rebalance asserts nothing, so the suite has to know how many did.
        // As committed, roughly half of the 200 draws reach the range builder in each configuration,
        // which leaves the floor below a wide margin and still fails loudly if a change to the
        // generators, or a latch left set by an earlier draw, stops feeding it.
        expect(rebalanced, 'no draw reached a rebalance').to.be.greaterThan(fuzz.numRuns / 8);
      });
    });
  }
});
