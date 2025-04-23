import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import checkTimepointEquals from 'test-utils/checkTimepointEquals';
import { expect } from 'test-utils/expect';
import { TEST_POOL_START_TIME } from 'test-utils/consts';
import { pluginFixture } from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, expandTo18Decimals, getMaxTick, getMinTick } from 'test-utils/utilities';
import snapshotGasCost from 'test-utils/snapshotGasCost';

import { MockPool, MockTimeDefaultMainPlugin, MockTimeDSFactory, MockTimeVirtualPool } from '../typechain';

describe('DefaultMainPlugin', () => {
  let wallet: Wallet, other: Wallet;

  let plugin: MockTimeDefaultMainPlugin; // modified plugin
  let mockPool: MockPool; // mock of AlgebraPool
  let mockPluginFactory: MockTimeDSFactory; // modified plugin factory

  let minTick = getMinTick(60);
  let maxTick = getMaxTick(60);

  async function initializeAtZeroTick(pool: MockPool) {
    await pool.initialize(encodePriceSqrt(1, 1));
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test DefaultMainPlugin', async () => {
    ({ plugin, mockPool, mockPluginFactory } = await loadFixture(pluginFixture));
  });

  describe('#Initialize', async () => {
    it('cannot initialize twice', async () => {
      await mockPool.setPlugin(plugin);
      await initializeAtZeroTick(mockPool);

      await expect(plugin.initialize()).to.be.revertedWith('Already initialized');
    });

    it('cannot initialize detached plugin', async () => {
      await initializeAtZeroTick(mockPool);
      await expect(plugin.initialize()).to.be.revertedWith('Plugin not attached');
    });

    it('cannot initialize if pool not initialized', async () => {
      await mockPool.setPlugin(plugin);
      await expect(plugin.initialize()).to.be.revertedWith('Pool is not initialized');
    });

    it('can initialize for existing pool', async () => {
      await initializeAtZeroTick(mockPool);
      await mockPool.setPlugin(plugin);
      await plugin.initialize();

      const timepoint = await plugin.timepoints(0);
      expect(timepoint.initialized).to.be.true;
    });

    it('can not write to uninitialized oracle', async () => {
      await initializeAtZeroTick(mockPool);
      await mockPool.setPlugin(plugin);
      await mockPool.setPluginConfig(1); // BEFORE_SWAP_FLAG

      await expect(mockPool.swapToTick(5)).to.be.revertedWith('Not initialized');
    });
  });

  // plain tests for hooks functionality
  describe('#Hooks', () => {
    it('only pool can call hooks', async () => {
      const errorMessage = 'Only pool can call this';
      await expect(plugin.beforeInitialize(wallet.address, 100)).to.be.revertedWith(errorMessage);
      await expect(plugin.afterInitialize(wallet.address, 100, 100)).to.be.revertedWith(errorMessage);
      await expect(plugin.beforeModifyPosition(wallet.address, wallet.address, 100, 100, 100, '0x')).to.be.revertedWith(errorMessage);
      await expect(plugin.afterModifyPosition(wallet.address, wallet.address, 100, 100, 100, 100, 100, '0x')).to.be.revertedWith(errorMessage);
      await expect(plugin.beforeSwap(wallet.address, wallet.address, true, 100, 100, false, '0x')).to.be.revertedWith(errorMessage);
      await expect(plugin.afterSwap(wallet.address, wallet.address, true, 100, 100, 100, 100, '0x')).to.be.revertedWith(errorMessage);
      await expect(plugin.beforeFlash(wallet.address, wallet.address, 100, 100, '0x')).to.be.revertedWith(errorMessage);
      await expect(plugin.afterFlash(wallet.address, wallet.address, 100, 100, 100, 100, '0x')).to.be.revertedWith(errorMessage);
    });

    describe('not implemented hooks', async () => {
      let defaultConfig: bigint;

      beforeEach('connect plugin to pool', async () => {
        defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
      });

      it('resets config after beforeModifyPosition', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });

      it('resets config after afterModifyPosition', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });

      it('resets config after beforeFlash', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });

      it('resets config after afterFlash', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });
    });
  });

  describe('#VolatilityVolatilityOracle', () => {
    beforeEach('connect plugin to pool', async () => {
      await mockPool.setPlugin(plugin);
    });

    it('initializes timepoints slot', async () => {
      await initializeAtZeroTick(mockPool);
      checkTimepointEquals(await plugin.timepoints(0), {
        initialized: true,
        blockTimestamp: BigInt(TEST_POOL_START_TIME),
        tickCumulative: 0n,
      });
    });

    describe('#getTimepoints', () => {
      beforeEach(async () => await initializeAtZeroTick(mockPool));

      // zero tick
      it('current tick accumulator increases by tick over time', async () => {
        let {
          tickCumulatives: [tickCumulative],
        } = await plugin.getTimepoints([0]);
        expect(tickCumulative).to.eq(0);
        await plugin.advanceTime(10);
        ({
          tickCumulatives: [tickCumulative],
        } = await plugin.getTimepoints([0]));
        expect(tickCumulative).to.eq(0);
      });

      it('current tick accumulator after single swap', async () => {
        // moves to tick -1
        await mockPool.swapToTick(-1);

        await plugin.advanceTime(4);
        let {
          tickCumulatives: [tickCumulative],
        } = await plugin.getTimepoints([0]);
        expect(tickCumulative).to.eq(-4);
      });

      it('current tick accumulator after swaps', async () => {
        await mockPool.swapToTick(-4463);
        expect((await mockPool.globalState()).tick).to.eq(-4463);
        await plugin.advanceTime(4);
        await mockPool.swapToTick(-1560);
        expect((await mockPool.globalState()).tick).to.eq(-1560);
        let {
          tickCumulatives: [tickCumulative0],
        } = await plugin.getTimepoints([0]);
        expect(tickCumulative0).to.eq(-17852);
        await plugin.advanceTime(60 * 5);
        await mockPool.swapToTick(-1561);
        let {
          tickCumulatives: [tickCumulative1],
        } = await plugin.getTimepoints([0]);
        expect(tickCumulative1).to.eq(-485852);
      });
    });

    it('writes an timepoint', async () => {
      await initializeAtZeroTick(mockPool);
      checkTimepointEquals(await plugin.timepoints(0), {
        tickCumulative: 0n,
        blockTimestamp: BigInt(TEST_POOL_START_TIME),
        initialized: true,
      });
      await plugin.advanceTime(1);
      await mockPool.swapToTick(10);
      checkTimepointEquals(await plugin.timepoints(1), {
        tickCumulative: 0n,
        blockTimestamp: BigInt(TEST_POOL_START_TIME + 1),
        initialized: true,
      });
    });

    it('does not write an timepoint', async () => {
      await initializeAtZeroTick(mockPool);
      checkTimepointEquals(await plugin.timepoints(0), {
        tickCumulative: 0n,
        blockTimestamp: BigInt(TEST_POOL_START_TIME),
        initialized: true,
      });
      await plugin.advanceTime(1);
      await mockPool.mint(wallet.address, wallet.address, -240, 0, 100, '0x');
      checkTimepointEquals(await plugin.timepoints(0), {
        tickCumulative: 0n,
        blockTimestamp: BigInt(TEST_POOL_START_TIME),
        initialized: true,
      });
    });

    describe('#getSingleTimepoint', () => {
      beforeEach(async () => await initializeAtZeroTick(mockPool));

      // zero tick
      it('current tick accumulator increases by tick over time', async () => {
        let { tickCumulative } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative).to.eq(0);
        await plugin.advanceTime(10);
        ({ tickCumulative } = await plugin.getSingleTimepoint(0));
        expect(tickCumulative).to.eq(0);
      });

      it('current tick accumulator after single swap', async () => {
        // moves to tick -1
        await mockPool.swapToTick(-1);

        await plugin.advanceTime(4);
        let { tickCumulative } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative).to.eq(-4);
      });

      it('current tick accumulator after swaps', async () => {
        await mockPool.swapToTick(-4463);
        expect((await mockPool.globalState()).tick).to.eq(-4463);
        await plugin.advanceTime(4);
        await mockPool.swapToTick(-1560);
        expect((await mockPool.globalState()).tick).to.eq(-1560);
        let { tickCumulative: tickCumulative0 } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative0).to.eq(-17852);
        await plugin.advanceTime(60 * 5);
        await mockPool.swapToTick(-1561);
        let { tickCumulative: tickCumulative1 } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative1).to.eq(-485852);
      });
    });

    describe('#prepayTimepointsStorageSlots', () => {
      it('can prepay', async () => {
        await plugin.prepayTimepointsStorageSlots(0, 50);
      });

      it('can prepay with space', async () => {
        await plugin.prepayTimepointsStorageSlots(10, 50);
      });

      it('writes after swap, prepaid after init', async () => {
        await initializeAtZeroTick(mockPool);
        await plugin.prepayTimepointsStorageSlots(1, 1);
        expect((await plugin.timepoints(1)).blockTimestamp).to.be.eq(1);
        await mockPool.swapToTick(-4463);
        expect((await mockPool.globalState()).tick).to.eq(-4463);
        await plugin.advanceTime(4);
        await mockPool.swapToTick(-1560);
        expect((await plugin.timepoints(1)).blockTimestamp).to.be.not.eq(1);
        expect((await mockPool.globalState()).tick).to.eq(-1560);
        let { tickCumulative: tickCumulative0 } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative0).to.eq(-17852);
      });

      it('writes after swap, prepaid before init', async () => {
        await plugin.prepayTimepointsStorageSlots(0, 2);
        await initializeAtZeroTick(mockPool);
        expect((await plugin.timepoints(1)).blockTimestamp).to.be.eq(1);
        await mockPool.swapToTick(-4463);
        expect((await mockPool.globalState()).tick).to.eq(-4463);
        await plugin.advanceTime(4);
        await mockPool.swapToTick(-1560);
        expect((await plugin.timepoints(1)).blockTimestamp).to.be.not.eq(1);
        expect((await mockPool.globalState()).tick).to.eq(-1560);
        let { tickCumulative: tickCumulative0 } = await plugin.getSingleTimepoint(0);
        expect(tickCumulative0).to.eq(-17852);
      });

      describe('failure cases', async () => {
        it('cannot rewrite initialized slot', async () => {
          await initializeAtZeroTick(mockPool);
          await expect(plugin.prepayTimepointsStorageSlots(0, 2)).to.be.reverted;
          await plugin.advanceTime(4);
          await mockPool.swapToTick(-1560);
          await expect(plugin.prepayTimepointsStorageSlots(1, 2)).to.be.reverted;
          await expect(plugin.prepayTimepointsStorageSlots(2, 2)).to.be.not.reverted;
        });

        it('cannot prepay 0 slots', async () => {
          await expect(plugin.prepayTimepointsStorageSlots(0, 0)).to.be.revertedWithoutReason;
        });

        it('cannot overflow index', async () => {
          await plugin.prepayTimepointsStorageSlots(0, 10);
          expect(plugin.prepayTimepointsStorageSlots(11, 2n ** 16n - 5n)).to.be.revertedWithoutReason;
          expect(plugin.prepayTimepointsStorageSlots(11, 2n ** 16n)).to.be.revertedWithoutReason;
        });
      });
    });
  });
});
