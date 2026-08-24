import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { VolatilityOracleTest } from '../typechain';
import { expect } from 'test-utils/expect';
import { TEST_POOL_START_TIME } from 'test-utils/consts';
import snapshotGasCost from 'test-utils/snapshotGasCost';

// Split out of VolatilityOracle.spec.ts so its gas snapshots live in their own snapshot file. Kept in
// the default run they showed up as obsolete on every `npx hardhat test`, and the next `--update` would
// have deleted them. Excluded from `npx hardhat test` by the @slow tag, run it with `pnpm test:slow`.
describe('VolatilityOracle', () => {
  let wallet: Wallet;

  before('create fixture loader', async () => {
    [wallet] = await (ethers as any).getSigners();
  });

  const volatilityOracleFixture = async () => {
    const volatilityOracleTestFactory = await ethers.getContractFactory('VolatilityOracleTest');
    return (await volatilityOracleTestFactory.deploy()) as any as VolatilityOracleTest;
  };

  describe('full volatilityOracle [ @slow ]', function () {
    this.timeout(10_200_000);

    let volatilityOracle: VolatilityOracleTest;

    let BATCH_SIZE = 1000;
    const step = 13;

    const STARTING_TIME = TEST_POOL_START_TIME;

    const maxedOutVolatilityOracleFixture = async () => {
      await ethers.provider.send('hardhat_setBalance', [wallet.address, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000000000']);
      const _volatilityOracle = await volatilityOracleFixture();
      await _volatilityOracle.initialize({ tick: 0, time: STARTING_TIME });

      let i = 1;
      for (i = 1; i < 65536; i += BATCH_SIZE) {
        if (i + BATCH_SIZE > 65536) {
          BATCH_SIZE = Math.ceil(65536 / 300) * 300 - i;
          console.log('batch update starting at', i);
          await _volatilityOracle.batchUpdateFixedTimedelta(BATCH_SIZE);
        } else {
          console.log('batch update starting at', i);
          await _volatilityOracle.batchUpdateFast(BATCH_SIZE);
        }
      }
      console.log('Length:', i);
      return _volatilityOracle;
    };

    beforeEach('create a full volatilityOracle', async () => {
      volatilityOracle = await loadFixture(maxedOutVolatilityOracleFixture);
    });

    it('index wrapped around', async () => {
      expect(await volatilityOracle.index()).to.eq(163);
    });

    async function checkGetPoints(secondsAgo: number, expected?: { tickCumulative: BigNumberish }) {
      const { tickCumulatives } = await volatilityOracle.getTimepoints([secondsAgo]);
      const check = {
        tickCumulative: tickCumulatives[0].toString(),
      };
      if (typeof expected === 'undefined') {
        expect(check).to.matchSnapshot();
      } else {
        expect(check).to.deep.eq({
          tickCumulative: expected.tickCumulative.toString(),
        });
      }
    }

    it('can getTimepoints into the ordered portion with exact seconds ago', async () => {
      await checkGetPoints(100 * step, {
        tickCumulative: '-27970560813',
      });
    });

    it('can getTimepoints into the ordered portion with inexact seconds ago', async () => {
      await checkGetPoints(100 * step + 5, {
        tickCumulative: '-27970232823',
      });
    });

    it('can getTimepoints at exactly the latest timepoint', async () => {
      await checkGetPoints(0, {
        tickCumulative: '-28055903863',
      });
    });

    it('can getTimepoints at exactly the latest timepoint after some time passes', async () => {
      await volatilityOracle.advanceTime(5);
      await checkGetPoints(5, {
        tickCumulative: '-28055903863',
      });
    });

    it('can getTimepoints after the latest timepoint counterfactual', async () => {
      await volatilityOracle.advanceTime(5);
      await checkGetPoints(3, {
        tickCumulative: '-28056035261',
      });
    });

    it('can getTimepoints into the unordered portion of array at exact seconds ago of timepoint', async () => {
      await checkGetPoints(200 * step, {
        tickCumulative: '-27885347763',
      });
    });

    it('can getTimepoints into the unordered portion of array at seconds ago between timepoints', async () => {
      await checkGetPoints(200 * step + 5, {
        tickCumulative: '-27885020273',
      });
    });

    it('can getTimepoints the oldest timepoint 13*65534 seconds ago', async () => {
      await checkGetPoints(step * 65534, {
        tickCumulative: '-175890',
      });
    });

    it('can getTimepoints the oldest timepoint 13*65534 + 5 seconds ago if time has elapsed', async () => {
      await volatilityOracle.advanceTime(5);
      await checkGetPoints(step * 65534 + 5, {
        tickCumulative: '-175890',
      });
    });

    describe('#getAverageVolatility', () => {
      const window = 24 * 60 * 60;

      describe('oldest timepoint is more than WINDOW seconds ago', async () => {
        beforeEach('initialize', async () => {
          await volatilityOracle.update({ advanceTimeBy: window + 1, tick: 7250 });
        });

        it('last timepoint is target', async () => {
          const volatility = await volatilityOracle.getAverageVolatility();
          expect(volatility).to.be.eq(3682928);
        });

        it('target is after last timepoint', async () => {
          await volatilityOracle.advanceTime(10);
          const volatility = await volatilityOracle.getAverageVolatility();
          expect(volatility).to.be.eq(4298339);
        });
      });
    });

    it('gas cost of getTimepoints(0)  [ @skip-on-coverage ]', async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([0]));
    });
    it(`gas cost of getTimepoints(200 * ${step})  [ @skip-on-coverage ]`, async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([200 * step]));
    });
    it(`gas cost of getTimepoints(200 * ${step} + 5)  [ @skip-on-coverage ]`, async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([200 * step + 5]));
    });
    it('gas cost of getTimepoints(0) after 5 seconds  [ @skip-on-coverage ]', async () => {
      await volatilityOracle.advanceTime(5);
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([0]));
    });
    it('gas cost of getTimepoints(5) after 5 seconds  [ @skip-on-coverage ]', async () => {
      await volatilityOracle.advanceTime(5);
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([5]));
    });
    it('gas cost of getTimepoints(middle)  [ @skip-on-coverage ]', async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([(65534 / 2) * step]));
    });
    it('gas cost of getTimepoints(oldest)  [ @skip-on-coverage ]', async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([65534 * step]));
    });
    it('gas cost of getTimepoints(oldest) after 5 seconds  [ @skip-on-coverage ]', async () => {
      await volatilityOracle.advanceTime(5);
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([65534 * step + 5]));
    });
    it('gas cost of getTimepoints(24h ago)  [ @skip-on-coverage ]', async () => {
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([24 * 60 * 60]));
    });
    it('gas cost of getTimepoints(24h ago) after 5 seconds  [ @skip-on-coverage ]', async () => {
      await volatilityOracle.advanceTime(5);
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([24 * 60 * 60]));
    });
    it('gas cost of getTimepoints(24h ago) after 15 minutes [ @skip-on-coverage ]', async () => {
      await volatilityOracle.advanceTime(15 * 60);
      await snapshotGasCost(volatilityOracle.getGasCostOfGetPoints([24 * 60 * 60]));
    });

    // Off on purpose: it fills the ring a second time inside this process, the slow case above, and
    // the wrap arithmetic is the same code the first wrap covers. Enable when changing the ring buffer.
    it.skip('second index wrap', async () => {
      let i = Number(await volatilityOracle.index());
      for (; i < 65536; i += BATCH_SIZE) {
        if (i + BATCH_SIZE > 65536) {
          BATCH_SIZE = Math.ceil(65536 / 300) * 300 - i;
          console.log('batch update starting at', i);
          await volatilityOracle.batchUpdateFixedTimedelta(BATCH_SIZE);
        } else {
          console.log('batch update starting at', i);
          await volatilityOracle.batchUpdateFast(BATCH_SIZE);
        }
      }
      expect(await volatilityOracle.index()).to.eq(163);
    });
  });
});
