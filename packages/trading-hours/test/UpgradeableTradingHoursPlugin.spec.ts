import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

import { deployPinnedProxyDeployer, pinnedPluginProxyFactory } from 'test-utils/pinnedProxy';
import { PLUGIN_FLAGS, encodePriceSqrt } from 'test-utils/utilities';

const SECONDS_PER_DAY = 86400;
const ALL_DAYS_MASK = 0b1111111;
const SAT_SUN_MASK = 0b1000001; // bit0 = Sunday, bit6 = Saturday
const SATURDAY_MASK = 1 << 6;
const NO_DAYS_MASK = 0;

const MONDAY = 1704067200; // 2024-01-01 00:00 UTC

// Every hook the pool can call, so the pool asks the plugin about operations it does not gate. A pool
// configured by something other than this plugin can carry any of these.
const ALL_OPERATION_FLAGS =
  PLUGIN_FLAGS.BEFORE_SWAP_FLAG |
  PLUGIN_FLAGS.AFTER_SWAP_FLAG |
  PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG |
  PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG |
  PLUGIN_FLAGS.BEFORE_FLASH_FLAG |
  PLUGIN_FLAGS.AFTER_FLASH_FLAG;

function dayStart(timestamp: number): number {
  return Math.floor(timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

// 0 = Sunday, from the JS calendar rather than from a copy of the library's own (dayCount + 4) % 7 -
// deriving the target day from the formula under test would move it in step with a wrong epoch anchor
function weekdayOf(timestamp: number): number {
  return new Date(timestamp * 1000).getUTCDay();
}

// First UTC instant at `secondsOfDay` strictly after `from`. These tests pin block timestamps instead
// of waiting, so every target has to lie in the future of whatever the fixture left on the chain.
function nextInstantAt(from: number, secondsOfDay: number): number {
  const candidate = dayStart(from) + secondsOfDay;
  return candidate > from ? candidate : candidate + SECONDS_PER_DAY;
}

// First UTC instant at `secondsOfDay` on the next occurrence of `weekday` strictly after `from`
function nextWeekdayInstantAt(from: number, weekday: number, secondsOfDay: number): number {
  let candidate = nextInstantAt(from, secondsOfDay);
  while (weekdayOf(candidate) !== weekday) candidate += SECONDS_PER_DAY;
  return candidate;
}

describe('UpgradeableTradingHoursPluginTest', function () {
  async function deployFixture() {
    const [owner, manager, user, otherUser] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // The plugin reads its pool out of the proxy's runtime code at POOL_ADDRESS_OFFSET, which only
    // holds under the production optimizer settings, so the proxy comes from pinned bytecode rather
    // than from a fresh artifact - a coverage build would otherwise move the immutable.
    const proxyDeployer: any = await deployPinnedProxyDeployer();

    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    const TradingHoursPluginImplementation = await ethers.getContractFactory('TradingHoursPluginImplementation');
    const tradingHoursImpl = await TradingHoursPluginImplementation.deploy();

    const UpgradeableTradingHoursPluginTest = await ethers.getContractFactory('UpgradeableTradingHoursPluginTest');
    const pluginImplementation = await UpgradeableTradingHoursPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      tradingHoursImpl.target
    );

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    type InitArgs = [number, number, number, number, boolean];

    function encodeInit(pool: any, args: InitArgs) {
      return pluginImplementation.interface.encodeFunctionData('initialize', [pool.target, ...args]);
    }

    async function deployPlugin(pool: any, args: InitArgs) {
      await proxyDeployer.deploy(beacon.target, pool.target, encodeInit(pool, args));
      const plugin = UpgradeableTradingHoursPluginTest.attach(await proxyDeployer.lastDeployedProxy()) as any;
      await pool.setPlugin(plugin.target);
      return plugin;
    }

    const plugin1 = await deployPlugin(mockPool, [9 * 3600, 18 * 3600, 0, SAT_SUN_MASK, false]);

    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      user,
      otherUser,
      mockFactory,
      proxyDeployer,
      mockPool,
      MockPool,
      tradingHoursImpl,
      pluginImplementation,
      beacon,
      plugin1,
      deployPlugin,
      encodeInit,
      UpgradeableTradingHoursPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  // Opens the pool for trading at any time and hands back a plugin the pool will consult on every swap
  async function openAllHours(plugin: any, manager: any, mockPool: any) {
    await plugin.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
    await plugin.connect(manager).setBlockedWeekdays(NO_DAYS_MASK);
    await plugin.connect(manager).setEnabled(true);
    await mockPool.setPluginConfig(await plugin.defaultPluginConfig());
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      const [start, end] = await plugin1.getTradingHours();
      expect(start).to.equal(9 * 3600);
      expect(end).to.equal(18 * 3600);
      expect(await plugin1.getBlockedWeekdays()).to.equal(SAT_SUN_MASK);
      expect(await plugin1.getDayOfWeekOffset()).to.equal(0);
      expect(await plugin1.getEnabled()).to.be.false;
    });

    it('should start with every blocked-window slot empty', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      for (let index = 0; index < 5; index++) {
        const [start, end] = await plugin1.getBlockedWindow(0, index);
        expect([start, end], `slot ${index}`).to.deep.equal([0n, 0n]);
      }
    });

    it('should allow trading at any timestamp while disabled', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // Sat/Sun are in the mask and the hours are 09:00-18:00, but nothing applies until enabled
      expect(await plugin1.isTradingAllowed(nextWeekdayInstantAt(0, 6, 3 * 3600))).to.be.true;
      expect(await plugin1.isTradingAllowed(0)).to.be.true;
    });

    it('should have Trading Hours Plugin as its only active module', async function () {
      const { plugin1 } = await loadFixture(deployFixture);
      const modules = await plugin1.getActiveModuleNames();
      expect(modules.length).to.equal(1);
      expect(modules[0]).to.equal('Trading Hours Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(plugin1.initialize(mockPool.target, 0, SECONDS_PER_DAY, 0, 0, false)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });

    it('should reject initialize from anyone but the plugin factory', async function () {
      const { beacon, mockPool, user, pluginImplementation, UpgradeableTradingHoursPluginTest } = await loadFixture(deployFixture);

      // `initializer` runs before `onlyPluginFactory`, so the factory guard is only reachable on a
      // proxy that was deployed without init data and never initialized
      const AlgebraPluginProxy = await pinnedPluginProxyFactory();
      const rawProxy = await AlgebraPluginProxy.deploy(beacon.target, mockPool.target, '0x');
      const uninitialized = UpgradeableTradingHoursPluginTest.attach(rawProxy.target) as any;

      await expect(
        uninitialized.connect(user).initialize(mockPool.target, 0, SECONDS_PER_DAY, 0, 0, false)
      ).to.be.revertedWithCustomError(pluginImplementation, 'OnlyPluginFactory');
    });

    it('should set correct default plugin config (BEFORE_SWAP_FLAG only)', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      expect(await plugin1.defaultPluginConfig()).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);
    });

    it('should refuse to deploy a plugin with an inverted trading window', async function () {
      const { beacon, proxyDeployer, mockPool, encodeInit, pluginImplementation } = await loadFixture(deployFixture);

      await expect(
        proxyDeployer.deploy(beacon.target, mockPool.target, encodeInit(mockPool, [18 * 3600, 9 * 3600, 0, 0, false]))
      ).to.be.revertedWithCustomError(pluginImplementation, 'InvalidTradingHours');
    });

    it('should refuse to deploy a plugin with a weekday mask above 0x7F', async function () {
      const { beacon, proxyDeployer, mockPool, encodeInit, pluginImplementation } = await loadFixture(deployFixture);

      await expect(
        proxyDeployer.deploy(beacon.target, mockPool.target, encodeInit(mockPool, [0, SECONDS_PER_DAY, 0, 0x80, false]))
      ).to.be.revertedWithCustomError(pluginImplementation, 'InvalidBlockedWeekdaysMask');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate trading-hours config for each proxy', async function () {
      const { plugin1, MockPool, deployPlugin } = await loadFixture(deployFixture);

      const mockPool2 = await MockPool.deploy();
      const plugin2 = await deployPlugin(mockPool2, [1 * 3600, 2 * 3600, 0, 0, true]);

      const [start1, end1] = await plugin1.getTradingHours();
      const [start2, end2] = await plugin2.getTradingHours();
      expect([start1, end1]).to.deep.equal([9n * 3600n, 18n * 3600n]);
      expect([start2, end2]).to.deep.equal([1n * 3600n, 2n * 3600n]);
      expect(await plugin1.getEnabled()).to.be.false;
      expect(await plugin2.getEnabled()).to.be.true;
    });

    it('should keep blocked windows and offsets of one proxy out of the other', async function () {
      const { plugin1, manager, MockPool, deployPlugin } = await loadFixture(deployFixture);

      const mockPool2 = await MockPool.deploy();
      const plugin2 = await deployPlugin(mockPool2, [0, SECONDS_PER_DAY, 0, 0, true]);

      await plugin1.connect(manager).setDayOfWeekOffset(3 * 3600);
      await plugin1.connect(manager).setBlockedWindow(0, 0, 100, 200);

      expect(await plugin2.getDayOfWeekOffset()).to.equal(0);
      const [untouchedStart, untouchedEnd] = await plugin2.getBlockedWindow(0, 0);
      expect([untouchedStart, untouchedEnd]).to.deep.equal([0n, 0n]);
      const [writtenStart, writtenEnd] = await plugin1.getBlockedWindow(0, 0);
      expect([writtenStart, writtenEnd]).to.deep.equal([100n, 200n]);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const { mockFactory, proxyDeployer, plugin1, MockPool, deployPlugin } = await loadFixture(deployFixture);

      const mockPool2 = await MockPool.deploy();
      const plugin2 = await deployPlugin(mockPool2, [0, SECONDS_PER_DAY, 0, 0, false]);

      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);
      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Authorization', function () {
    // Every entry point behind _authorize, with arguments that are valid on a freshly deployed plugin
    const guarded: [string, unknown[]][] = [
      ['setEnabled', [true]],
      ['setTradingHours', [0, SECONDS_PER_DAY]],
      ['setDayOfWeekOffset', [3 * 3600]],
      ['setBlockedWeekdays', [SAT_SUN_MASK]],
      ['setBlockedWindow', [0, 0, 100, 200]],
      ['setBlockedWindows', [[{ day: 0, index: 0, startSeconds: 100, endSeconds: 200 }]]],
    ];

    for (const [method, args] of guarded) {
      it(`should reject unauthorized users for ${method}`, async function () {
        const { plugin1, user } = await loadFixture(deployFixture);
        await expect(plugin1.connect(user)[method](...args)).to.be.revertedWith('Not authorized');
      });

      it(`should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call ${method}`, async function () {
        const { plugin1, manager } = await loadFixture(deployFixture);
        await expect(plugin1.connect(manager)[method](...args)).to.not.be.reverted;
      });

      it(`should allow the factory owner to call ${method}`, async function () {
        const { plugin1, owner } = await loadFixture(deployFixture);
        await expect(plugin1.connect(owner)[method](...args)).to.not.be.reverted;
      });
    }

    it('should stop accepting calls from an account whose role was revoked', async function () {
      const { plugin1, manager, mockFactory, ALGEBRA_BASE_PLUGIN_MANAGER } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setEnabled(true)).to.not.be.reverted;

      await mockFactory.revokeRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);
      await expect(plugin1.connect(manager).setEnabled(false)).to.be.revertedWith('Not authorized');
    });
  });

  describe('Events', function () {
    it('should emit EnabledUpdated on both sides of the switch', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setEnabled(true)).to.emit(plugin1, 'EnabledUpdated').withArgs(true);
      await expect(plugin1.connect(manager).setEnabled(false)).to.emit(plugin1, 'EnabledUpdated').withArgs(false);
    });

    it('should emit EnabledUpdated even when the value does not change', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      // already disabled, and the setter is deliberately not a no-op guard
      await expect(plugin1.connect(manager).setEnabled(false)).to.emit(plugin1, 'EnabledUpdated').withArgs(false);
    });

    it('should emit TradingHoursUpdated with the new window', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setTradingHours(8 * 3600, 20 * 3600))
        .to.emit(plugin1, 'TradingHoursUpdated')
        .withArgs(8 * 3600, 20 * 3600);
    });

    it('should emit DayOfWeekOffsetUpdated with a negative offset', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setDayOfWeekOffset(-5 * 3600))
        .to.emit(plugin1, 'DayOfWeekOffsetUpdated')
        .withArgs(-5 * 3600);
    });

    it('should emit BlockedWeekdaysUpdated with the new mask', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK))
        .to.emit(plugin1, 'BlockedWeekdaysUpdated')
        .withArgs(ALL_DAYS_MASK);
    });

    it('should emit BlockedWindowUpdated with the day floored to its UTC start', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      const noon = MONDAY + 12 * 3600;
      await expect(plugin1.connect(manager).setBlockedWindow(noon, 1, 3600, 7200))
        .to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(dayStart(noon), 1, 3600, 7200);
    });

    it('should emit BlockedWindowUpdated once per entry of a batch', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      const monday = MONDAY;
      const tuesday = monday + SECONDS_PER_DAY;

      await expect(
        plugin1.connect(manager).setBlockedWindows([
          { day: monday + 12 * 3600, index: 0, startSeconds: 100, endSeconds: 200 },
          { day: monday + 23 * 3600, index: 1, startSeconds: 300, endSeconds: 400 },
          { day: tuesday, index: 0, startSeconds: 500, endSeconds: 600 },
        ])
      )
        .to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(monday, 0, 100, 200)
        .and.to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(monday, 1, 300, 400)
        .and.to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(tuesday, 0, 500, 600);
    });

    it('should emit BlockedWindowUpdated with the clearing sentinel', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setBlockedWindow(0, 0, 100, 200);
      await expect(plugin1.connect(manager).setBlockedWindow(0, 0, 0, 0))
        .to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(0, 0, 0, 0);
    });

    it('should emit exactly as many events as the batch had entries', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      // `.to.emit` only asks that a matching log exists, so a connector emitting one event too many
      // would satisfy the case above. This counts them.
      const receipt = await (
        await plugin1.connect(manager).setBlockedWindows([
          { day: MONDAY, index: 0, startSeconds: 100, endSeconds: 200 },
          { day: MONDAY, index: 1, startSeconds: 300, endSeconds: 400 },
          { day: MONDAY + SECONDS_PER_DAY, index: 0, startSeconds: 500, endSeconds: 600 },
        ])
      ).wait();

      const emitted = receipt!.logs
        .map((log) => plugin1.interface.parseLog(log as any))
        .filter((parsed: any) => parsed?.name === 'BlockedWindowUpdated');
      expect(emitted.length).to.equal(3);
    });

    it('should emit twice for a duplicated slot while storing it once', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      // the connector emits from its own loop over the inputs, the module writes from another, so a
      // batch naming one slot twice is the case where the two disagree by design
      await expect(
        plugin1.connect(manager).setBlockedWindows([
          { day: MONDAY, index: 0, startSeconds: 1000, endSeconds: 2000 },
          { day: MONDAY + 12 * 3600, index: 0, startSeconds: 5000, endSeconds: 6000 },
        ])
      )
        .to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(MONDAY, 0, 1000, 2000)
        .and.to.emit(plugin1, 'BlockedWindowUpdated')
        .withArgs(MONDAY, 0, 5000, 6000);

      const [start, end] = await plugin1.getBlockedWindow(MONDAY, 0);
      expect([start, end]).to.deep.equal([5000n, 6000n]);
    });
  });

  describe('Configuration errors through the connector', function () {
    // The module raises these inside a delegatecall, and BaseConnector re-raises the return data by
    // hand in assembly - these assert the custom error survives that boundary.
    it('should bubble InvalidTradingHours', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      await expect(plugin1.connect(manager).setTradingHours(200, 100)).to.be.revertedWithCustomError(plugin1, 'InvalidTradingHours');
    });

    it('should bubble InvalidBlockedWeekdaysMask', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      await expect(plugin1.connect(manager).setBlockedWeekdays(0x80)).to.be.revertedWithCustomError(
        plugin1,
        'InvalidBlockedWeekdaysMask'
      );
    });

    it('should bubble InvalidBlockedWindowIndex', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      await expect(plugin1.connect(manager).setBlockedWindow(0, 5, 100, 200)).to.be.revertedWithCustomError(
        plugin1,
        'InvalidBlockedWindowIndex'
      );
    });

    it('should bubble InvalidBlockedWindowRange', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      await expect(plugin1.connect(manager).setBlockedWindow(0, 0, 300, 200)).to.be.revertedWithCustomError(
        plugin1,
        'InvalidBlockedWindowRange'
      );
    });

    it('should bubble out of a batch and persist none of its entries', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(manager).setBlockedWindows([
          { day: 0, index: 0, startSeconds: 100, endSeconds: 200 },
          { day: 0, index: 5, startSeconds: 300, endSeconds: 400 },
        ])
      ).to.be.revertedWithCustomError(plugin1, 'InvalidBlockedWindowIndex');

      const [start, end] = await plugin1.getBlockedWindow(0, 0);
      expect([start, end]).to.deep.equal([0n, 0n]);
    });
  });

  describe('Pool wiring', function () {
    it('should write its plugin config into the pool on beforeInitialize', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect((await mockPool.globalState()).pluginConfig).to.equal(0);

      await mockPool.initialize(encodePriceSqrt(1, 1));

      expect((await mockPool.globalState()).pluginConfig).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);
    });

    it('should reject beforeInitialize from anyone but the pool', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(user).beforeInitialize(user.address, encodePriceSqrt(1, 1))).to.be.revertedWithCustomError(
        plugin1,
        'OnlyPool'
      );
    });

    it('should reject beforeSwap from anyone but the pool', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).beforeSwap(user.address, user.address, true, 0, 0, false, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'OnlyPool');
    });
  });

  describe('beforeSwap hook integration', function () {
    it('should allow swap when disabled', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should allow swap when enabled but nothing is blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      // the hook answers (selector, 0, 0) and the pool keeps both fees: this module never overrides them
      expect(await mockPool.overrideFee()).to.equal(0);
      expect(await mockPool.pluginFee()).to.equal(0);
    });

    it('should block swap when enabled and every weekday is blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
    });

    it('should allow swap again once disabled, even with every weekday blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await plugin1.connect(manager).setEnabled(false);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });
  });

  describe('The gate can be lifted from outside the module', function () {
    // Everything this module promises runs through one bit of the pool's plugin config, which the
    // plugin writes exactly once from beforeInitialize. These pin what happens when someone else
    // moves it, because the module keeps reporting itself enabled either way.
    it('should stop being consulted once the pool clears its plugin config', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await mockPool.setPluginConfig(0);

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
      // and the module has no idea: it still says it is on, and still says trading is closed
      expect(await plugin1.getEnabled()).to.be.true;
      expect(await plugin1.isTradingAllowed(await time.latest())).to.be.false;
    });

    it('should only get the flag back through a fresh pool initialize', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool.setPluginConfig(0);

      // no entry point on the plugin writes the pool's config, so nothing it can be asked to do helps
      await plugin1.connect(manager).setEnabled(false);
      await plugin1.connect(manager).setEnabled(true);
      expect((await mockPool.globalState()).pluginConfig).to.equal(0);

      await mockPool.initialize(encodePriceSqrt(1, 1));
      expect((await mockPool.globalState()).pluginConfig).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
    });

    it('should leave the config alone when initialize runs against a pool that already has it', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await mockPool.initialize(encodePriceSqrt(1, 1));
      expect((await mockPool.globalState()).pluginConfig).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);

      // the second pass takes the other arm of _updatePluginConfigInPool, where nothing is written
      await expect(mockPool.initialize(encodePriceSqrt(1, 1))).to.not.be.reverted;
      expect((await mockPool.globalState()).pluginConfig).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);
    });

    it('should stop gating when the pool is pointed at another plugin', async function () {
      const { plugin1, mockPool, manager, deployPlugin } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      // a second plugin for the same pool, left disabled; deployPlugin repoints the pool at it
      const replacement = await deployPlugin(mockPool, [0, SECONDS_PER_DAY, 0, ALL_DAYS_MASK, false]);

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
      expect(await plugin1.getEnabled()).to.be.true; // the orphaned plugin keeps its whole configuration
      expect(await replacement.getEnabled()).to.be.false;
    });
  });

  describe('Gas', function () {
    it('should skip the delegatecall while disabled [ @skip-on-coverage ]', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);

      // Each swap is measured on a second, warmed-up call so the pool writes the same values into the
      // same warm slots every time and the differences belong to the plugin.
      async function measureSwap() {
        await mockPool.swapToTick(0);
        return (await (await mockPool.swapToTick(0)).wait())!.gasUsed;
      }

      await mockPool.setPluginConfig(0); // pool does not consult the plugin at all
      const noPlugin = await measureSwap();

      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());
      const disabled = await measureSwap();

      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(NO_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);
      const enabled = await measureSwap();

      // _verifyTrading reads `enabled` from storage before delegating, so a disabled pool pays for the
      // hook and that one read but not for the module's call. Comparing enabled against disabled alone
      // does not pin that: the module returns early when disabled, so removing the shortcut still
      // leaves the enabled swap dearer. What moves is the disabled swap. Measured here: with the
      // shortcut 18862 / 6918, with it removed 22207 / 3439, so both bounds sit between the two.
      expect(disabled - noPlugin, 'what a disabled pool pays the plugin').to.be.lessThan(20000n);
      expect(enabled - disabled, 'what enabling adds').to.be.greaterThan(5000n);
    });
  });

  describe('Swaps as time passes', function () {
    // Nothing here calls the plugin between two swaps: the only thing that changes is the clock, which
    // is the state this module exists to react to.
    it('should stop accepting swaps when the daily window closes and accept them again the next day', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const open = nextInstantAt(await time.latest(), 12 * 3600);
      await plugin1.connect(manager).setTradingHours(12 * 3600, 13 * 3600);

      await time.setNextBlockTimestamp(open);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await time.setNextBlockTimestamp(open + 3600 - 1); // last second inside the window
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await time.setNextBlockTimestamp(open + 3600); // end is exclusive
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(open + SECONDS_PER_DAY);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should stop accepting swaps for the length of a blocked window', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const open = nextInstantAt(await time.latest(), 10 * 3600);
      const day = dayStart(open);
      await plugin1.connect(manager).setBlockedWindow(day, 0, 11 * 3600, 12 * 3600);

      await time.setNextBlockTimestamp(open);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await time.setNextBlockTimestamp(day + 11 * 3600);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(day + 12 * 3600); // end is exclusive
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should not carry a blocked window into the following day', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const open = nextInstantAt(await time.latest(), 10 * 3600);
      const day = dayStart(open);
      await plugin1.connect(manager).setBlockedWindow(day, 0, 0, SECONDS_PER_DAY); // block that day whole

      await time.setNextBlockTimestamp(open);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(day + SECONDS_PER_DAY);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should start blocking a weekday at local midnight under a positive offset', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const offset = 3 * 3600; // UTC+3, so the local Saturday starts on Friday 21:00 UTC
      await plugin1.connect(manager).setDayOfWeekOffset(offset);
      await plugin1.connect(manager).setBlockedWeekdays(SATURDAY_MASK);

      // a day of slack, so the instant one minute before the local boundary is still in the future
      const utcSaturday = nextWeekdayInstantAt((await time.latest()) + SECONDS_PER_DAY, 6, 0);
      const localSaturdayStart = utcSaturday - offset;

      await time.setNextBlockTimestamp(localSaturdayStart - 60);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await time.setNextBlockTimestamp(localSaturdayStart);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
    });

    it('should apply a narrowed window to the very next swap', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const noon = nextInstantAt(await time.latest(), 12 * 3600);
      await time.setNextBlockTimestamp(noon);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      // the pool is live and mid-session when the window is narrowed underneath it
      await plugin1.connect(manager).setTradingHours(0, 3600);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should apply a blocked window covering the current moment to the very next swap', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      const noon = nextInstantAt(await time.latest(), 12 * 3600);
      await time.setNextBlockTimestamp(noon);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await plugin1.connect(manager).setBlockedWindow(noon, 0, 11 * 3600, 13 * 3600);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await plugin1.connect(manager).setBlockedWindow(noon, 0, 0, 0);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });
  });

  describe('Two pools behind one beacon', function () {
    it('should block one pool and let the other trade at the same instant', async function () {
      const { plugin1, mockPool, manager, MockPool, deployPlugin } = await loadFixture(deployFixture);

      const mockPool2 = await MockPool.deploy();
      const plugin2 = await deployPlugin(mockPool2, [0, SECONDS_PER_DAY, 0, NO_DAYS_MASK, true]);

      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool2.setPluginConfig(await plugin2.defaultPluginConfig());

      const instant = nextInstantAt(await time.latest(), 12 * 3600);
      expect(await plugin1.isTradingAllowed(instant)).to.be.false;
      expect(await plugin2.isTradingAllowed(instant)).to.be.true;

      await time.setNextBlockTimestamp(instant);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await time.setNextBlockTimestamp(instant + 1);
      await expect(mockPool2.swapToTick(0)).to.not.be.reverted;
    });
  });

  describe('Flash and liquidity operations are never gated', function () {
    // The pool is configured with every hook flag, not just the one this plugin asks for, so the
    // operations really do reach the plugin and the assertions cannot pass by the pool skipping it.
    it('should allow flash even while a swap in the same state is blocked', async function () {
      const { plugin1, mockPool, manager, owner } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool.setPluginConfig(ALL_OPERATION_FLAGS);

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
      await expect(mockPool.flash(owner.address, 0, 0, '0x')).to.not.be.reverted;
    });

    it('should allow add/remove liquidity even while a swap in the same state is blocked', async function () {
      const { plugin1, mockPool, manager, owner } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool.setPluginConfig(ALL_OPERATION_FLAGS);

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
      await expect(mockPool.mint(owner.address, owner.address, -60, 60, 1000, '0x')).to.not.be.reverted;
      await expect(mockPool.burn(-60, 60, 500, '0x')).to.not.be.reverted;
    });
  });
});
