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

// Deterministic seeded PRNG (mulberry32) for the property tests at the end of this file, so a failure
// reproduces on someone else's machine. Kept here rather than in test-utils: it is six lines, and
// test-utils is a dependency of every package in the workspace.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

    it('should wire the pool up even at an instant the module blocks', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);

      // A pool has to be creatable on a weekend or a holiday: only swaps are gated, and beforeInitialize
      // is what writes the plugin config the gate itself depends on. Blocking it would make a pool
      // deployed outside trading hours permanently unable to consult the plugin.
      const instant = nextInstantAt(await time.latest(), 12 * 3600);
      expect(await plugin1.isTradingAllowed(instant)).to.be.false;

      await time.setNextBlockTimestamp(instant);
      await expect(mockPool.initialize(encodePriceSqrt(1, 1))).to.not.be.reverted;

      expect((await mockPool.globalState()).pluginConfig).to.equal(PLUGIN_FLAGS.BEFORE_SWAP_FLAG);
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
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

    it('should charge little for the window scan even with every slot populated [ @skip-on-coverage ]', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      // The worst case an open pool can reach: five populated slots, none of them matching, so the loop
      // runs to the end instead of breaking on an empty lane. Both measurements sit at the same second
      // of the day on consecutive days, and both take the second of two swaps, so the pool writes the
      // same values into the same warm slots either way and the difference belongs to the scan.
      async function measureSwapAt(instant: number) {
        await time.setNextBlockTimestamp(instant);
        await mockPool.swapToTick(0);
        return (await (await mockPool.swapToTick(0)).wait())!.gasUsed;
      }

      const evening = nextInstantAt(await time.latest(), 23 * 3600);
      const noWindows = await measureSwapAt(evening);

      const nextEvening = evening + SECONDS_PER_DAY;
      const day = dayStart(nextEvening);
      for (let i = 0; i < 5; i++) {
        await plugin1.connect(manager).setBlockedWindow(day, i, i * 3600, (i + 1) * 3600); // all well before 23:00
      }
      const fiveWindows = await measureSwapAt(nextEvening);

      // Both paths load the same single packed word, so what is measured here is five iterations of
      // shift-and-compare against one early return: measured at 928 gas, and the bound leaves the loop
      // room to grow without quietly leaving the "one word, five lanes" cost model behind.
      expect(fiveWindows - noWindows, 'what a full slot scan adds').to.be.lessThan(2000n);
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

  describe('The shared implementation instance', function () {
    it('should ignore writes made directly to the implementation contract', async function () {
      const { plugin1, mockPool, manager, tradingHoursImpl } = await loadFixture(deployFixture);
      await openAllHours(plugin1, manager, mockPool);

      // The implementation carries no access control of its own, because it is only ever meant to be
      // reached by delegatecall and its own storage belongs to nobody. Anyone can still write it, and
      // this pins that such a write reaches no plugin: every proxy keeps its schedule in its own storage.
      await tradingHoursImpl.setTradingHours(0, 1);
      await tradingHoursImpl.setBlockedWeekdays(ALL_DAYS_MASK);
      await tradingHoursImpl.setEnabled(true);

      const instant = (await time.latest()) + 1;
      expect(await tradingHoursImpl.isTradingAllowed(instant), 'the implementation closed itself').to.be.false;
      expect(await plugin1.isTradingAllowed(instant), 'the plugin it delegates for').to.be.true;
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });
  });

  describe('Batch capacity', function () {
    it('should apply a hundred-entry batch in one transaction', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      // Nothing bounds the array, and the connector walks it a second time to emit one event per entry,
      // so this pins what a realistic holiday calendar - a hundred single-day closures loaded at once -
      // actually costs, rather than leaving the limit to be discovered on a live network.
      const firstDay = dayStart(await time.latest()) + SECONDS_PER_DAY;
      const inputs = Array.from({ length: 100 }, (_, i) => ({
        day: firstDay + i * SECONDS_PER_DAY,
        index: 0,
        startSeconds: 9 * 3600,
        endSeconds: 18 * 3600,
      }));

      const receipt = (await (await plugin1.connect(manager).setBlockedWindows(inputs)).wait())!;

      expect(receipt.logs.length, 'one event per entry').to.equal(inputs.length);
      // 2.87M gas measured, comfortably inside one block: a calendar this size needs no splitting
      expect(receipt.gasUsed, 'a hundred closures in one transaction').to.be.lessThan(5_000_000n);

      for (const i of [0, 42, 99]) {
        const [start, end] = await plugin1.getBlockedWindow(inputs[i].day, 0);
        expect([Number(start), Number(end)], `entry ${i}`).to.deep.equal([9 * 3600, 18 * 3600]);
      }
    });
  });

  describe('Fuzz: the enforced gate agrees with isTradingAllowed', function () {
    // isTradingAllowed reads the connector's own storage directly; the swap path delegatecalls into the
    // implementation and reverts from there. Two separate pieces of code answering the same question,
    // and every other test in this package exercises one or the other. This one drives both from the
    // same configuration and fails if they ever disagree - including on which second they disagree at.
    const fuzz = {
      seed: Number(process.env.FUZZ_SEED ?? 20260904),
      rounds: Number(process.env.FUZZ_ROUNDS ?? 10),
    };

    this.timeout(180000);

    it('should revert a swap exactly when the view says trading is closed', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());
      await plugin1.connect(manager).setEnabled(true);

      const rand = mulberry32(fuzz.seed);
      const clamp = (second: number) => Math.max(0, Math.min(SECONDS_PER_DAY - 1, second));
      // two days of slack, so the first round's configuration is written well before its own probes
      let day = dayStart(await time.latest()) + 2 * SECONDS_PER_DAY;

      let blocked = 0;
      let allowed = 0;

      for (let round = 0; round < fuzz.rounds; round++) {
        const start = Math.floor(rand() * (SECONDS_PER_DAY - 1));
        const end = start + 1 + Math.floor(rand() * (SECONDS_PER_DAY - start));
        const windowStart = Math.floor(rand() * (SECONDS_PER_DAY - 1));
        const windowEnd = windowStart + 1 + Math.floor(rand() * (SECONDS_PER_DAY - windowStart));
        // an empty mask often enough that the weekday guard does not swallow most of the probes
        const mask = rand() < 0.5 ? NO_DAYS_MASK : Math.floor(rand() * 128);
        const offset = Math.floor(rand() * 172800) - SECONDS_PER_DAY;

        await plugin1.connect(manager).setTradingHours(start, end);
        await plugin1.connect(manager).setBlockedWeekdays(mask);
        await plugin1.connect(manager).setDayOfWeekOffset(offset);
        await plugin1.connect(manager).setBlockedWindow(day, 0, windowStart, windowEnd);

        // Straddle each threshold, and ascending: every probe pins the timestamp of the next block, so
        // a second that has already been mined can never be revisited.
        const thresholds = [start, clamp(start - 1), clamp(end - 1), clamp(end), windowStart, clamp(windowStart - 1), clamp(windowEnd)];
        const seconds = [...new Set(thresholds)].sort((a, b) => a - b);

        for (const second of seconds) {
          const instant = day + second;
          const open = await plugin1.isTradingAllowed(instant);

          await time.setNextBlockTimestamp(instant);
          if (open) {
            await expect(mockPool.swapToTick(0), `view says open at ${instant}`).to.not.be.reverted;
            allowed++;
          } else {
            await expect(mockPool.swapToTick(0), `view says closed at ${instant}`).to.be.revertedWithCustomError(
              plugin1,
              'TradingNotAllowed'
            );
            blocked++;
          }
        }

        await plugin1.connect(manager).setBlockedWindow(day, 0, 0, 0);
        day += SECONDS_PER_DAY * (1 + Math.floor(rand() * 3));
      }

      // A run that answered one way throughout would pass against a gate wired to a constant, so both
      // outcomes have to show up. Expressed per round, to survive a raised FUZZ_ROUNDS.
      expect(blocked, 'swaps the gate refused').to.be.greaterThan(fuzz.rounds);
      expect(allowed, 'swaps the gate let through').to.be.greaterThan(fuzz.rounds);
    });
  });

  describe('Fuzz: the event log reconstructs the stored schedule', function () {
    // An indexer, or the admin panel someone will build on top of this, never reads storage - it
    // replays events. Two things make that non-trivial here: BlockedWindowUpdated reports the day
    // floored to UTC midnight rather than the argument that was passed, and a batch emits one event
    // per entry, including entries a later entry in the same call overwrites. So a replay has to land
    // on exactly what the getters return, and the existing cases only check one event at a time.
    const fuzz = {
      seed: Number(process.env.FUZZ_SEED ?? 20260904),
      rounds: Number(process.env.FUZZ_ROUNDS ?? 16),
    };
    const SLOT_COUNT = 5;

    this.timeout(180000);

    it('should fold every emitted event back into the state the getters report', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      const rand = mulberry32(fuzz.seed + 5);

      const base = dayStart(await time.latest()) + SECONDS_PER_DAY;
      const days = [base, base + SECONDS_PER_DAY, base + 2 * SECONDS_PER_DAY];

      // initialize emits no Trading Hours event of its own, so a replay cannot discover the defaults
      // the factory passed in and has to seed itself from them. Everything after this point has to
      // come out of the log.
      const [initialStart, initialEnd] = await plugin1.getTradingHours();
      const model = {
        start: Number(initialStart),
        end: Number(initialEnd),
        mask: Number(await plugin1.getBlockedWeekdays()),
        offset: Number(await plugin1.getDayOfWeekOffset()),
        enabled: await plugin1.getEnabled(),
        windows: new Map(days.map((day) => [day, Array.from({ length: SLOT_COUNT }, () => ({ start: 0, end: 0 }))])),
      };

      let windowEvents = 0;
      let overwrites = 0;
      let clears = 0;

      function fold(receipt: any) {
        for (const log of receipt.logs) {
          const parsed = plugin1.interface.parseLog(log);
          if (!parsed) continue;

          if (parsed.name === 'TradingHoursUpdated') {
            model.start = Number(parsed.args[0]);
            model.end = Number(parsed.args[1]);
          } else if (parsed.name === 'BlockedWeekdaysUpdated') {
            model.mask = Number(parsed.args[0]);
          } else if (parsed.name === 'DayOfWeekOffsetUpdated') {
            model.offset = Number(parsed.args[0]);
          } else if (parsed.name === 'EnabledUpdated') {
            model.enabled = parsed.args[0];
          } else if (parsed.name === 'BlockedWindowUpdated') {
            const day = Number(parsed.args[0]);
            const index = Number(parsed.args[1]);
            const slots = model.windows.get(day);
            expect(slots, `event reported day ${day}, which is not one of the days written to`).to.not.be.undefined;

            const start = Number(parsed.args[2]);
            const end = Number(parsed.args[3]);
            const previous = slots![index];
            if (previous.start !== 0 || previous.end !== 0) {
              if (start === 0 && end === 0) clears++;
              else overwrites++;
            }
            slots![index] = { start, end };
            windowEvents++;
          }
        }
      }

      // Days are passed unfloored - a random second inside the target day - so the replay only lines up
      // if the event carries the floored day the getters are keyed by.
      const anySecondIn = (day: number) => day + Math.floor(rand() * SECONDS_PER_DAY);

      // Slots are aimed at what the replay has already seen filled, so that overwrites and clears -
      // the two ways a fold can drift from storage - actually happen instead of being left to chance.
      function drawOp() {
        const day = days[Math.floor(rand() * days.length)];
        const populated = model.windows
          .get(day)!
          .map((slot, index) => (slot.start !== 0 || slot.end !== 0 ? index : -1))
          .filter((index) => index >= 0);

        const index =
          populated.length > 0 && rand() < 0.6 ? populated[Math.floor(rand() * populated.length)] : Math.floor(rand() * SLOT_COUNT);

        if (rand() < 0.3) return { day: anySecondIn(day), index, startSeconds: 0, endSeconds: 0 }; // clearing sentinel
        const startSeconds = Math.floor(rand() * (SECONDS_PER_DAY - 1));
        return {
          day: anySecondIn(day),
          index,
          startSeconds,
          endSeconds: startSeconds + 1 + Math.floor(rand() * (SECONDS_PER_DAY - startSeconds - 1)),
        };
      }

      // send the call, then fold what it emitted - the only way state reaches the model in this test
      const send = async (call: Promise<any>) => fold((await (await call).wait())!);

      for (let round = 0; round < fuzz.rounds; round++) {
        if (rand() < 0.5) {
          // entries drawn together, so a batch can name the same slot twice: both are emitted, one stored
          const inputs = Array.from({ length: 1 + Math.floor(rand() * 4) }, drawOp);
          await send(plugin1.connect(manager).setBlockedWindows(inputs));
        } else {
          const op = drawOp();
          await send(plugin1.connect(manager).setBlockedWindow(op.day, op.index, op.startSeconds, op.endSeconds));
        }

        // the scalar setters, so the replay has to keep up with those too
        if (rand() < 0.4) {
          const start = Math.floor(rand() * (SECONDS_PER_DAY - 1));
          const end = start + 1 + Math.floor(rand() * (SECONDS_PER_DAY - start - 1));
          await send(plugin1.connect(manager).setTradingHours(start, end));
        }
        if (rand() < 0.4) await send(plugin1.connect(manager).setBlockedWeekdays(Math.floor(rand() * 128)));
        if (rand() < 0.4) await send(plugin1.connect(manager).setDayOfWeekOffset(Math.floor(rand() * 172800) - SECONDS_PER_DAY));
        if (rand() < 0.4) await send(plugin1.connect(manager).setEnabled(rand() < 0.5));
      }

      const [start, end] = await plugin1.getTradingHours();
      expect(Number(start), 'trading window start').to.equal(model.start);
      expect(Number(end), 'trading window end').to.equal(model.end);
      expect(Number(await plugin1.getBlockedWeekdays()), 'weekday mask').to.equal(model.mask);
      expect(Number(await plugin1.getDayOfWeekOffset()), 'day-of-week offset').to.equal(model.offset);
      expect(await plugin1.getEnabled(), 'enabled flag').to.equal(model.enabled);

      for (const day of days) {
        for (let index = 0; index < SLOT_COUNT; index++) {
          const [slotStart, slotEnd] = await plugin1.getBlockedWindow(day, index);
          const expected = model.windows.get(day)![index];
          expect([Number(slotStart), Number(slotEnd)], `day ${day} slot ${index}`).to.deep.equal([expected.start, expected.end]);
        }
      }

      // A replay that only ever saw untouched slots would agree with storage for the wrong reason, so
      // the run has to have overwritten and cleared populated slots along the way.
      expect(windowEvents, 'window events folded').to.be.greaterThan(fuzz.rounds);
      expect(overwrites, 'events that landed on a populated slot').to.be.greaterThan(0);
      expect(clears, 'events that cleared a populated slot').to.be.greaterThan(0);
    });
  });
});
