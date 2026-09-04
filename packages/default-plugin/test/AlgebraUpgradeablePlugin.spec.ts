import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { upgradeablePluginFixture } from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, getMaxTick, getMinTick } from 'test-utils/utilities';

import { MockPool, MockTimeAlgebraUpgradeablePlugin, MockTimeUpgradeablePluginFactory, MockTimeVirtualPool } from '../typechain';

const SECONDS_PER_DAY = 86400;

// The Trading Hours module reads block.timestamp, not the plugin's mock clock, so its cases pin the
// timestamp of the next block instead of calling advanceTime like the oracle-driven ones do.
function dayStart(timestamp: number): number {
  return Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

// First UTC instant at `secondsOfDay` strictly after `from`
function nextInstantAt(from: number, secondsOfDay: number): number {
  const candidate = dayStart(from) + secondsOfDay;
  return candidate > from ? candidate : candidate + SECONDS_PER_DAY;
}

// First UTC instant at `secondsOfDay` on the next occurrence of `weekday` (0 = Sunday) after `from`
function nextWeekdayInstantAt(from: number, weekday: number, secondsOfDay: number): number {
  let candidate = nextInstantAt(from, secondsOfDay);
  while (new Date(candidate * 1000).getUTCDay() !== weekday) candidate += SECONDS_PER_DAY;
  return candidate;
}

describe('AlgebraUpgradeablePlugin', () => {
  let wallet: Wallet, other: Wallet;

  let plugin: MockTimeAlgebraUpgradeablePlugin;
  let mockPool: MockPool;
  let mockPluginFactory: MockTimeUpgradeablePluginFactory;

  let minTick = getMinTick(60);
  let maxTick = getMaxTick(60);

  async function initializeAtZeroTick(pool: MockPool) {
    await pool.initialize(encodePriceSqrt(1, 1));
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test AlgebraUpgradeablePlugin', async () => {
    ({ plugin, mockPool, mockPluginFactory } = await loadFixture(upgradeablePluginFixture));
  });

  // plain tests for hooks functionality
  describe('#Hooks', () => {
    it('only pool can call hooks', async () => {
      await expect(plugin.beforeInitialize(wallet.address, 100)).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterInitialize(wallet.address, 100, 100)).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeModifyPosition(wallet.address, wallet.address, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterModifyPosition(wallet.address, wallet.address, 100, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeSwap(wallet.address, wallet.address, true, 100, 100, false, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterSwap(wallet.address, wallet.address, true, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeFlash(wallet.address, wallet.address, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterFlash(wallet.address, wallet.address, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
    });

    describe('not implemented hooks', async () => {
      let defaultConfig: bigint;

      beforeEach('connect plugin to pool', async () => {
        defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
      });

      // Note: beforeModifyPosition is used by Security plugin, so it keeps its config
      it('keeps config after beforeModifyPosition (used by Security)', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
      });

      it('resets config after afterModifyPosition', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });

      // Note: beforeFlash is used by Security plugin, so it keeps its config
      it('keeps config after beforeFlash (used by Security)', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
      });

      it('resets config after afterFlash', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });
    });
  });

  describe('#FarmingPlugin', () => {
    describe('virtual pool tests', () => {
      let virtualPoolMock: MockTimeVirtualPool;

      beforeEach('deploy virtualPoolMock', async () => {
        await mockPluginFactory.setFarmingAddress(wallet);
        const virtualPoolMockFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        virtualPoolMock = (await virtualPoolMockFactory.deploy()) as any as MockTimeVirtualPool;
      });

      it('set incentive works', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
      });

      it('can detach incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('can detach incentive even if no more has rights to connect plugins', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot attach incentive even if no more has rights to connect plugins', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await expect(plugin.setIncentive(other)).to.be.revertedWith('Not allowed to set incentive');
      });

      it('new farming can detach old incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await plugin.connect(other).setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot detach incentive if nothing connected', async () => {
        await mockPool.setPlugin(plugin);
        await expect(plugin.setIncentive(ZeroAddress)).to.be.revertedWith('Already active');
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot set same incentive twice', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Already active');
      });

      it('cannot set incentive if has active', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await expect(plugin.setIncentive(wallet.address)).to.be.revertedWith('Has active incentive');
      });

      it('can detach incentive if not connected to pool', async () => {
        const defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
        await mockPool.setPluginConfig(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        await mockPool.setPlugin(ZeroAddress);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('can set incentive if afterSwap hook is active', async () => {
        const defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
        await mockPool.setPluginConfig(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
      });

      it('set incentive works only for PluginFactory.farmingAddress', async () => {
        await mockPluginFactory.setFarmingAddress(ZeroAddress);
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Not allowed to set incentive');
      });

      it('incentive can not be attached if plugin is not attached', async () => {
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Plugin not attached');
      });

      it('incentive attached before initialization', async () => {
        await mockPool.setPlugin(plugin);

        await plugin.setIncentive(virtualPoolMock);
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.mint(wallet.address, wallet.address, -120, 120, 1, '0x');
        await mockPool.mint(wallet.address, wallet.address, minTick, maxTick, 1, '0x');

        await mockPool.swapToTick(-130);

        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;

        const tick = (await mockPool.globalState()).tick;
        expect(await virtualPoolMock.currentTick()).to.be.eq(tick);
        expect(await virtualPoolMock.timestamp()).to.be.gt(0);
      });

      it('incentive attached after initialization', async () => {
        await mockPool.setPlugin(plugin);
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await plugin.setIncentive(virtualPoolMock);

        await mockPool.mint(wallet.address, wallet.address, -120, 120, 1, '0x');
        await mockPool.mint(wallet.address, wallet.address, minTick, maxTick, 1, '0x');

        await mockPool.swapToTick(-130);

        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;

        const tick = (await mockPool.globalState()).tick;
        expect(await virtualPoolMock.currentTick()).to.be.eq(tick);
        expect(await virtualPoolMock.timestamp()).to.be.gt(0);
      });
    });

    describe('#isIncentiveConnected', () => {
      let virtualPoolMock: MockTimeVirtualPool;

      beforeEach('deploy virtualPoolMock', async () => {
        await mockPluginFactory.setFarmingAddress(wallet);
        const virtualPoolMockFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        virtualPoolMock = (await virtualPoolMockFactory.deploy()) as any as MockTimeVirtualPool;
      });

      it('true with active incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;
      });

      it('false with invalid address', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.isIncentiveConnected.staticCall(wallet.address)).to.be.false;
      });

      it('false if plugin detached', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPool.setPlugin(ZeroAddress);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.false;
      });

      it('false if hook deactivated', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPool.setPluginConfig(0);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.false;
      });
    });

    describe('#Incentive', () => {
      it('incentive is not detached after swap', async () => {
        await mockPool.setPlugin(plugin);
        await initializeAtZeroTick(mockPool);
        await mockPluginFactory.setFarmingAddress(wallet.address);

        const vpStubFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        let vpStub = (await vpStubFactory.deploy()) as any as MockTimeVirtualPool;

        await plugin.setIncentive(vpStub);
        const initLiquidityAmount = 10000000000n;
        await mockPool.mint(wallet.address, wallet.address, -120, 120, initLiquidityAmount, '0x');
        await mockPool.mint(wallet.address, wallet.address, -1200, 1200, initLiquidityAmount, '0x');
        await mockPool.swapToTick(-200);

        expect(await plugin.incentive()).to.be.eq(await vpStub.getAddress());
      });
    });
  });

  describe('#ModuleIdentification', () => {
    beforeEach('connect plugin to pool', async () => {
      await mockPool.setPlugin(plugin);
    });


    describe('#getActiveModuleNames', () => {
      it('returns array with all module names', async () => {
        const moduleNames = await plugin.getActiveModuleNames();
        
        expect(moduleNames).to.be.an('array');
        expect(moduleNames.length).to.eq(6);
        
        // Check each module name is a non-empty string
        for (const moduleName of moduleNames) {
          expect(moduleName).to.be.a('string');
          expect(moduleName.length).to.be.gt(0);
        }
      });

      it('returns expected module names in correct order', async () => {
        const moduleNames = await plugin.getActiveModuleNames();
        
        // Verify all expected modules are present
        expect(moduleNames).to.include('Volatility Oracle Plugin');
        expect(moduleNames).to.include('Dynamic Fee Plugin');
        expect(moduleNames).to.include('Farming Proxy Plugin');
        expect(moduleNames).to.include('Security Plugin');
        expect(moduleNames).to.include('ALM Plugin');
        expect(moduleNames).to.include('Trading Hours Plugin');

        // Verify module count
        expect(moduleNames).to.have.lengthOf(6);
      });

    });
  });

  // The Trading Hours module has its own package, where it is tested against a plugin that carries
  // nothing else. These are the cases that need the whole plugin around it: the gate sits in
  // beforeSwap next to the security check, the fee calculation and the oracle write.
  describe('#TradingHours', () => {
    beforeEach('connect plugin to pool', async () => {
      await mockPool.setPlugin(plugin);
      await mockPool.initialize(encodePriceSqrt(1, 1));
    });

    it('is created disabled, so even a weekend swap goes through', async () => {
      // The factory hands every new pool the Sat/Sun mask already filled in, switched off
      expect(await plugin.getEnabled()).to.be.eq(false);
      expect(await plugin.getBlockedWeekdays()).to.be.eq(0x41);

      await time.setNextBlockTimestamp(nextWeekdayInstantAt(await time.latest(), 6, 12 * 3600));
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('blocks a swap outside the daily window and allows it inside', async () => {
      await plugin.setTradingHours(9 * 3600, 18 * 3600);
      await plugin.setBlockedWeekdays(0);
      await plugin.setEnabled(true);

      const closed = nextInstantAt(await time.latest(), 8 * 3600);
      await time.setNextBlockTimestamp(closed);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(nextInstantAt(closed, 9 * 3600));
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('blocks a swap on a masked weekday', async () => {
      await plugin.setTradingHours(0, SECONDS_PER_DAY);
      await plugin.setEnabled(true); // the mask the factory set is Sat/Sun

      // both instants come off the same base, so the Monday is a day after the Sunday whether or not
      // the reverting transaction above made it into a block
      const sunday = nextWeekdayInstantAt(await time.latest(), 0, 12 * 3600);
      await time.setNextBlockTimestamp(sunday);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(sunday + SECONDS_PER_DAY);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('leaves liquidity and flash alone while a swap is blocked', async () => {
      await plugin.setTradingHours(0, 1);
      await plugin.setBlockedWeekdays(0);
      await plugin.setEnabled(true);

      await time.setNextBlockTimestamp(nextInstantAt(await time.latest(), 12 * 3600));
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'TradingNotAllowed');

      await expect(mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x')).to.not.be.reverted;
      await expect(mockPool.burn(0, 60, 50, '0x')).to.not.be.reverted;
      await expect(mockPool.flash(wallet.address, 100, 100, '0x')).to.not.be.reverted;
    });

    it('answers with the security error first when both modules would refuse', async () => {
      // _checkStatus runs before _verifyTrading in beforeSwap, so a pool that is both suspended and
      // outside its hours reports the suspension. Pinned because the two lines are interchangeable at
      // a glance, and swapping them would silently change what every blocked trader is told.
      const securityRegistry = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();
      await plugin.setSecurityRegistry(await securityRegistry.getAddress());
      await securityRegistry.setGlobalStatus(2); // DISABLED

      await plugin.setTradingHours(0, 1);
      await plugin.setBlockedWeekdays(0);
      await plugin.setEnabled(true);

      const closed = nextInstantAt(await time.latest(), 12 * 3600);
      await time.setNextBlockTimestamp(closed);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'PoolDisabled');

      // and with security happy again, the same swap reports the hours
      await securityRegistry.setGlobalStatus(0); // ENABLED
      await time.setNextBlockTimestamp(closed + 60);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'TradingNotAllowed');
    });
  });
});
