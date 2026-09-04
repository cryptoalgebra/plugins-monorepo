import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { deployPinnedProxyDeployer } from 'test-utils/pinnedProxy';

const SECONDS_PER_DAY = 86400;
const ALL_DAYS_MASK = 0b1111111;
const SAT_SUN_MASK = 0b1000001;

const MONDAY = 1704067200; // 2024-01-01 00:00 UTC

// The configuration the fixture puts on plugin1, so each field can be checked one by one after the
// beacon swap rather than in aggregate.
const STORED = {
  startSeconds: 9 * 3600,
  endSeconds: 18 * 3600,
  offsetSeconds: -5 * 3600,
  mask: SAT_SUN_MASK,
  enabled: true,
  windowDay: MONDAY,
  windowStart: 10 * 3600,
  windowEnd: 11 * 3600,
};

describe('UpgradeableTradingHoursPluginTest upgrade', function () {
  async function deployFixture() {
    const [owner, manager, user, beaconOwner] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const proxyDeployer: any = await deployPinnedProxyDeployer();

    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();
    const mockPool2 = await MockPool.deploy();

    const TradingHoursPluginImplementation = await ethers.getContractFactory('TradingHoursPluginImplementation');
    const tradingHoursImpl = await TradingHoursPluginImplementation.deploy();

    const UpgradeableTradingHoursPluginTest = await ethers.getContractFactory('UpgradeableTradingHoursPluginTest');
    const pluginImplementation = await UpgradeableTradingHoursPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      tradingHoursImpl.target
    );

    const UpgradedTradingHoursPluginTest = await ethers.getContractFactory('UpgradedTradingHoursPluginTest');
    const upgradedImplementation = await UpgradedTradingHoursPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      tradingHoursImpl.target
    );

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);
    // Split the two authorities apart: without this the Algebra factory owner and the beacon owner are
    // the same account and "only the beacon owner may upgrade" cannot be asserted.
    await beacon.transferOwnership(beaconOwner.address);

    async function deployPlugin(pool: any, args: [number, number, number, number, boolean]) {
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [pool.target, ...args]);
      await proxyDeployer.deploy(beacon.target, pool.target, initData);
      const plugin = UpgradeableTradingHoursPluginTest.attach(await proxyDeployer.lastDeployedProxy()) as any;
      await pool.setPlugin(plugin.target);
      return plugin;
    }

    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    const plugin1 = await deployPlugin(mockPool, [STORED.startSeconds, STORED.endSeconds, 0, STORED.mask, false]);
    const plugin2 = await deployPlugin(mockPool2, [0, SECONDS_PER_DAY, 0, 0, false]);

    await plugin1.connect(manager).setDayOfWeekOffset(STORED.offsetSeconds);
    await plugin1.connect(manager).setBlockedWindow(STORED.windowDay, 0, STORED.windowStart, STORED.windowEnd);
    await plugin1.connect(manager).setEnabled(STORED.enabled);

    async function upgrade() {
      await beacon.connect(beaconOwner).upgradeTo(upgradedImplementation.target);
      return UpgradedTradingHoursPluginTest.attach(plugin1.target) as any;
    }

    return {
      owner,
      manager,
      user,
      beaconOwner,
      mockFactory,
      mockPool,
      mockPool2,
      proxyDeployer,
      beacon,
      plugin1,
      plugin2,
      pluginImplementation,
      upgradedImplementation,
      UpgradedTradingHoursPluginTest,
      deployPlugin,
      upgrade,
    };
  }

  describe('Authorization', function () {
    it('should let the beacon owner upgrade', async function () {
      const { beacon, beaconOwner, upgradedImplementation } = await loadFixture(deployFixture);

      await expect(beacon.connect(beaconOwner).upgradeTo(upgradedImplementation.target)).to.not.be.reverted;
      expect(await beacon.implementation()).to.equal(upgradedImplementation.target);
    });

    it('should reject an upgrade from the Algebra factory owner', async function () {
      const { beacon, owner, mockFactory, upgradedImplementation } = await loadFixture(deployFixture);

      expect(await mockFactory.owner()).to.equal(owner.address);
      await expect(beacon.connect(owner).upgradeTo(upgradedImplementation.target)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('should reject an upgrade from the plugin manager', async function () {
      const { beacon, manager, upgradedImplementation } = await loadFixture(deployFixture);

      await expect(beacon.connect(manager).upgradeTo(upgradedImplementation.target)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('should reject an upgrade from an anonymous account', async function () {
      const { beacon, user, upgradedImplementation } = await loadFixture(deployFixture);

      await expect(beacon.connect(user).upgradeTo(upgradedImplementation.target)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('Propagation', function () {
    it('should reach every proxy deployed before the upgrade', async function () {
      const { upgrade, plugin2, UpgradedTradingHoursPluginTest } = await loadFixture(deployFixture);

      const upgraded1 = await upgrade();
      const upgraded2 = UpgradedTradingHoursPluginTest.attach(plugin2.target) as any;

      expect(await upgraded1.isUpgraded()).to.be.true;
      expect(await upgraded2.isUpgraded()).to.be.true;
    });

    it('should hand the new implementation to proxies created afterwards', async function () {
      const { upgrade, deployPlugin, mockPool2, UpgradedTradingHoursPluginTest } = await loadFixture(deployFixture);

      await upgrade();
      const fresh = await deployPlugin(mockPool2, [0, SECONDS_PER_DAY, 0, 0, true]);

      expect(await (UpgradedTradingHoursPluginTest.attach(fresh.target) as any).isUpgraded()).to.be.true;
      expect(await fresh.getEnabled()).to.be.true;
    });

    it('should not answer the new implementation before the upgrade', async function () {
      const { plugin1, UpgradedTradingHoursPluginTest } = await loadFixture(deployFixture);

      // proves isUpgraded() discriminates rather than always answering true: the old implementation
      // has no such selector and no fallback, so the call dies with no return data
      const notYet = UpgradedTradingHoursPluginTest.attach(plugin1.target) as any;
      await expect(notYet.isUpgraded()).to.be.revertedWithoutReason();
    });
  });

  describe('Stored state survives the swap', function () {
    it('should keep the trading window', async function () {
      const { upgrade } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      const [start, end] = await upgraded.getTradingHours();
      expect(start).to.equal(STORED.startSeconds);
      expect(end).to.equal(STORED.endSeconds);
    });

    it('should keep the day-of-week offset', async function () {
      const { upgrade } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      expect(await upgraded.getDayOfWeekOffset()).to.equal(STORED.offsetSeconds);
    });

    it('should keep the blocked-weekdays mask', async function () {
      const { upgrade } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      expect(await upgraded.getBlockedWeekdays()).to.equal(STORED.mask);
    });

    it('should keep the enabled flag', async function () {
      const { upgrade } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      expect(await upgraded.getEnabled()).to.equal(STORED.enabled);
    });

    it('should keep the populated blocked window, which lives in a mapping', async function () {
      const { upgrade } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      const [start, end] = await upgraded.getBlockedWindow(STORED.windowDay, 0);
      expect(start).to.equal(STORED.windowStart);
      expect(end).to.equal(STORED.windowEnd);
    });

    it('should keep the pool the proxy was deployed for', async function () {
      const { upgrade, mockPool } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      expect(await upgraded.pool()).to.equal(mockPool.target);
    });

    it('should answer isTradingAllowed the same way before and after', async function () {
      const { plugin1, upgrade } = await loadFixture(deployFixture);

      const probes = [
        STORED.windowDay + 9 * 3600, // inside hours, outside the window
        STORED.windowDay + STORED.windowStart, // inside the blocked window
        STORED.windowDay + 20 * 3600, // outside hours
      ];
      const before = [];
      for (const probe of probes) before.push(await plugin1.isTradingAllowed(probe));

      const upgraded = await upgrade();
      for (let i = 0; i < probes.length; i++) {
        expect(await upgraded.isTradingAllowed(probes[i]), `probe ${probes[i]}`).to.equal(before[i]);
      }
    });
  });

  describe('After the upgrade', function () {
    it('should still gate swaps through the module', async function () {
      const { upgrade, mockPool, manager, plugin1 } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      await upgraded.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await upgraded.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool.setPluginConfig(await upgraded.defaultPluginConfig());

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      await upgraded.connect(manager).setBlockedWeekdays(0);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should keep blocking a live pool across the swap, with nothing reconfigured in between', async function () {
      const { plugin1, mockPool, manager, upgrade } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());
      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');

      // this is the sequence a real upgrade takes, and the one where a storage-layout mistake shows up
      // as trading reopening rather than as a wrong getter
      await upgrade();

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
    });

    it('should keep letting an open pool trade across the swap', async function () {
      const { plugin1, mockPool, manager, upgrade } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(0);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;

      await upgrade();

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should still refuse unauthorized configuration', async function () {
      const { upgrade, user } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      await expect(upgraded.connect(user).setEnabled(false)).to.be.revertedWith('Not authorized');
      await expect(upgraded.connect(user).setNewVariable(1)).to.be.revertedWith('Not authorized');
    });

    it('should keep the trading-hours fields intact while a new module writes its own storage', async function () {
      const { upgrade, manager } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      await upgraded.connect(manager).setNewVariable(99999);
      expect(await upgraded.getNewVariable()).to.equal(99999);

      // the new field lives in its own ERC-7201 namespace, so none of these may have moved
      const [start, end] = await upgraded.getTradingHours();
      expect(start).to.equal(STORED.startSeconds);
      expect(end).to.equal(STORED.endSeconds);
      expect(await upgraded.getDayOfWeekOffset()).to.equal(STORED.offsetSeconds);
      expect(await upgraded.getBlockedWeekdays()).to.equal(STORED.mask);
      expect(await upgraded.getEnabled()).to.equal(STORED.enabled);
      const [windowStart, windowEnd] = await upgraded.getBlockedWindow(STORED.windowDay, 0);
      expect([windowStart, windowEnd]).to.deep.equal([BigInt(STORED.windowStart), BigInt(STORED.windowEnd)]);
    });

    it('should not re-run initialize', async function () {
      const { upgrade, mockPool } = await loadFixture(deployFixture);
      const upgraded = await upgrade();

      await expect(upgraded.initialize(mockPool.target, 0, SECONDS_PER_DAY, 0, 0, false)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });
  });
});
