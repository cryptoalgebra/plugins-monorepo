import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

const SECONDS_PER_DAY = 86400;
const ALL_DAYS_MASK = 0b1111111;

describe('UpgradeableTradingHoursPluginTest', function () {
  async function deployFixture() {
    const [owner, manager, user, otherUser] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

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

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      9 * 3600,
      18 * 3600,
      0,
      0b1000001, // Sat/Sun
      false,
    ]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();
    const plugin1 = UpgradeableTradingHoursPluginTest.attach(proxy1Address) as any;

    await mockPool.setPlugin(proxy1Address);

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
      tradingHoursImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableTradingHoursPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      const [start, end] = await plugin1.getTradingHours();
      expect(start).to.equal(9 * 3600);
      expect(end).to.equal(18 * 3600);
      expect(await plugin1.getBlockedWeekdays()).to.equal(0b1000001);
      expect(await plugin1.getEnabled()).to.be.false;
    });

    it('should have Trading Hours Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);
      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Trading Hours Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, 0, SECONDS_PER_DAY, 0, 0, false)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config (BEFORE_SWAP_FLAG only)', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const BEFORE_SWAP_FLAG = 1n;
      expect(await plugin1.defaultPluginConfig()).to.equal(BEFORE_SWAP_FLAG);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate trading-hours config for each proxy', async function () {
      const { beacon, pluginImplementation, plugin1, proxyDeployer, UpgradeableTradingHoursPluginTest } =
        await loadFixture(deployFixture);

      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        1 * 3600,
        2 * 3600,
        0,
        0,
        true,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableTradingHoursPluginTest.attach(proxy2Address) as any;

      const [start1, end1] = await plugin1.getTradingHours();
      const [start2, end2] = await plugin2.getTradingHours();
      expect([start1, end1]).to.deep.equal([9n * 3600n, 18n * 3600n]);
      expect([start2, end2]).to.deep.equal([1n * 3600n, 2n * 3600n]);
      expect(await plugin1.getEnabled()).to.be.false;
      expect(await plugin2.getEnabled()).to.be.true;
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const { beacon, mockFactory, proxyDeployer, pluginImplementation, plugin1, UpgradeableTradingHoursPluginTest } =
        await loadFixture(deployFixture);

      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        0,
        SECONDS_PER_DAY,
        0,
        0,
        false,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableTradingHoursPluginTest.attach(proxy2Address) as any;

      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);
      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner } = await loadFixture(deployFixture);
      await expect(plugin1.connect(owner).setEnabled(true)).to.not.be.reverted;
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      await expect(plugin1.connect(manager).setEnabled(true)).to.not.be.reverted;
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);
      await expect(plugin1.connect(user).setEnabled(true)).to.be.revertedWith('Not authorized');
    });

    it('should reject unauthorized users for setTradingHours/setBlockedWeekdays/setBlockedWindow', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);
      await expect(plugin1.connect(user).setTradingHours(0, SECONDS_PER_DAY)).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(user).setBlockedWeekdays(0)).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(user).setBlockedWindow(0, 0, 0, 0)).to.be.revertedWith('Not authorized');
    });
  });

  describe('beforeSwap hook integration', function () {
    it('should allow swap when disabled', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should allow swap when enabled but nothing is blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(0);
      await plugin1.connect(manager).setEnabled(true);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });

    it('should block swap when enabled and every weekday is blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.swapToTick(0)).to.be.revertedWithCustomError(plugin1, 'TradingNotAllowed');
    });

    it('should allow swap again once disabled, even with every weekday blocked', async function () {
      const { plugin1, mockPool, manager } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());
      await expect(mockPool.swapToTick(0)).to.be.reverted;

      await plugin1.connect(manager).setEnabled(false);
      await expect(mockPool.swapToTick(0)).to.not.be.reverted;
    });
  });

  describe('Flash and liquidity operations are never gated', function () {
    it('should allow flash even when trading is fully blocked', async function () {
      const { plugin1, mockPool, manager, owner } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.flash(owner.address, 0, 0, '0x')).to.not.be.reverted;
    });

    it('should allow add/remove liquidity even when trading is fully blocked', async function () {
      const { plugin1, mockPool, manager, owner } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setTradingHours(0, SECONDS_PER_DAY);
      await plugin1.connect(manager).setBlockedWeekdays(ALL_DAYS_MASK);
      await plugin1.connect(manager).setEnabled(true);
      await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

      await expect(mockPool.mint(owner.address, owner.address, -60, 60, 1000, '0x')).to.not.be.reverted;
      await expect(mockPool.burn(-60, 60, 500, '0x')).to.not.be.reverted;
    });
  });
});
