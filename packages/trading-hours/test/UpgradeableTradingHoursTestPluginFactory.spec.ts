import { ethers } from 'hardhat';
import { expect } from 'chai';
import { impersonateAccount, loadFixture, setBalance } from '@nomicfoundation/hardhat-network-helpers';

const SECONDS_PER_DAY = 86400;
const SAT_SUN_MASK = 0b1000001; // bit0 = Sunday, bit6 = Saturday

// What a pool gets before its admin configures anything: the whole day open, no offset, Sat/Sun in the
// mask, and the module switched off so none of it applies yet.
const FACTORY_DEFAULTS = {
  startSeconds: 0,
  endSeconds: SECONDS_PER_DAY,
  offsetSeconds: 0,
  mask: SAT_SUN_MASK,
  enabled: false,
};

describe('UpgradeableTradingHoursTestPluginFactory', function () {
  async function deployFixture() {
    const [owner, admin, user] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    const Factory = await ethers.getContractFactory('UpgradeableTradingHoursTestPluginFactory');
    const pluginFactory = await Factory.deploy(mockFactory.target);

    const UpgradeableTradingHoursPluginTest = await ethers.getContractFactory('UpgradeableTradingHoursPluginTest');

    // the Algebra factory is a contract in production, so the only way to call the hooks it owns is to
    // send from its address
    await impersonateAccount(mockFactory.target as string);
    await setBalance(mockFactory.target as string, ethers.parseEther('1'));
    const asAlgebraFactory = await ethers.getSigner(mockFactory.target as string);

    // MockFactory.poolByPair is a plain mapping, so any two addresses stand in for a token pair
    const token0 = '0x1111111111111111111111111111111111111111';
    const token1 = '0x2222222222222222222222222222222222222222';

    const POOLS_ADMINISTRATOR_ROLE = await mockFactory.POOLS_ADMINISTRATOR_ROLE();
    await mockFactory.grantRole(POOLS_ADMINISTRATOR_ROLE, admin.address);

    async function attachPlugin(pool: any) {
      return UpgradeableTradingHoursPluginTest.attach(await pluginFactory.pluginByPool(pool.target ?? pool)) as any;
    }

    return {
      owner,
      admin,
      user,
      mockFactory,
      mockPool,
      pluginFactory,
      asAlgebraFactory,
      token0,
      token1,
      POOLS_ADMINISTRATOR_ROLE,
      attachPlugin,
    };
  }

  describe('Deployment', function () {
    it('should deploy its own module implementation and a beacon over the plugin', async function () {
      const { pluginFactory, mockFactory } = await loadFixture(deployFixture);

      expect(await pluginFactory.algebraFactory()).to.equal(mockFactory.target);
      expect(await pluginFactory.tradingHoursImplementation()).to.not.equal(ethers.ZeroAddress);
      expect(await pluginFactory.pluginImplementation()).to.not.equal(ethers.ZeroAddress);

      const beacon = await ethers.getContractAt('UpgradeableBeacon', await pluginFactory.beacon());
      expect(await beacon.implementation()).to.equal(await pluginFactory.pluginImplementation());
    });
  });

  describe('beforeCreatePoolHook', function () {
    it('should reject anyone but the Algebra factory', async function () {
      const { pluginFactory, mockPool, user } = await loadFixture(deployFixture);

      await expect(
        pluginFactory
          .connect(user)
          .beforeCreatePoolHook(mockPool.target, user.address, user.address, user.address, user.address, '0x')
      ).to.be.revertedWith('Only AlgebraFactory');
    });

    it('should create a plugin for the pool and record it', async function () {
      const { pluginFactory, mockPool, asAlgebraFactory, owner } = await loadFixture(deployFixture);

      await pluginFactory
        .connect(asAlgebraFactory)
        .beforeCreatePoolHook(mockPool.target, owner.address, owner.address, owner.address, owner.address, '0x');

      expect(await pluginFactory.pluginByPool(mockPool.target)).to.not.equal(ethers.ZeroAddress);
    });

    it('should refuse a second plugin for the same pool', async function () {
      const { pluginFactory, mockPool, asAlgebraFactory, owner } = await loadFixture(deployFixture);

      const create = () =>
        pluginFactory
          .connect(asAlgebraFactory)
          .beforeCreatePoolHook(mockPool.target, owner.address, owner.address, owner.address, owner.address, '0x');

      await create();
      await expect(create()).to.be.revertedWith('Already created');
    });

    it('should start the pool disabled, open all day, with Sat/Sun in the mask', async function () {
      const { pluginFactory, mockPool, asAlgebraFactory, owner, attachPlugin } = await loadFixture(deployFixture);

      await pluginFactory
        .connect(asAlgebraFactory)
        .beforeCreatePoolHook(mockPool.target, owner.address, owner.address, owner.address, owner.address, '0x');

      const plugin = await attachPlugin(mockPool);
      const [start, end] = await plugin.getTradingHours();
      expect(start).to.equal(FACTORY_DEFAULTS.startSeconds);
      expect(end).to.equal(FACTORY_DEFAULTS.endSeconds);
      expect(await plugin.getDayOfWeekOffset()).to.equal(FACTORY_DEFAULTS.offsetSeconds);
      expect(await plugin.getBlockedWeekdays()).to.equal(FACTORY_DEFAULTS.mask);
      expect(await plugin.getEnabled()).to.equal(FACTORY_DEFAULTS.enabled);
    });

    it('should leave the Sat/Sun default with no effect until the pool admin enables the module', async function () {
      const { pluginFactory, mockPool, asAlgebraFactory, owner, attachPlugin } = await loadFixture(deployFixture);

      await pluginFactory
        .connect(asAlgebraFactory)
        .beforeCreatePoolHook(mockPool.target, owner.address, owner.address, owner.address, owner.address, '0x');

      const plugin = await attachPlugin(mockPool);
      const saturday = 1704499200; // 2024-01-06 00:00 UTC
      expect(await plugin.isTradingAllowed(saturday)).to.be.true;

      await plugin.connect(owner).setEnabled(true);
      expect(await plugin.isTradingAllowed(saturday)).to.be.false;
    });
  });

  describe('afterCreatePoolHook', function () {
    it('should reject anyone but the Algebra factory', async function () {
      const { pluginFactory, user } = await loadFixture(deployFixture);

      await expect(
        pluginFactory.connect(user).afterCreatePoolHook(user.address, user.address, user.address)
      ).to.be.revertedWith('Only AlgebraFactory');
    });

    it('should accept the Algebra factory', async function () {
      const { pluginFactory, asAlgebraFactory, owner } = await loadFixture(deployFixture);

      await expect(pluginFactory.connect(asAlgebraFactory).afterCreatePoolHook(owner.address, owner.address, owner.address)).to
        .not.be.reverted;
    });
  });

  describe('Upgrades through the factory', function () {
    // The beacon is created in the factory's constructor, so the factory owns it and nothing outside
    // can call upgradeTo directly. That is why the factory forwards it, the way
    // AlgebraUpgradeablePluginFactory.upgradePlugins does - without the forwarder every plugin the
    // factory ever created would be frozen, and no spec would notice.
    async function upgradedImplementation(pluginFactory: any, mockFactory: any) {
      const Upgraded = await ethers.getContractFactory('UpgradedTradingHoursPluginTest');
      return Upgraded.deploy(mockFactory.target, pluginFactory.target, await pluginFactory.tradingHoursImplementation());
    }

    it('should reject a caller without POOLS_ADMINISTRATOR_ROLE', async function () {
      const { pluginFactory, mockFactory, user } = await loadFixture(deployFixture);
      const impl = await upgradedImplementation(pluginFactory, mockFactory);

      await expect(pluginFactory.connect(user).upgradePlugins(impl.target)).to.be.revertedWith('Not authorized');
    });

    it('should let the pools administrator upgrade every plugin the factory created', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, token0, token1 } = await loadFixture(deployFixture);
      await mockFactory.stubPool(token0, token1, mockPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);

      const impl = await upgradedImplementation(pluginFactory, mockFactory);
      await pluginFactory.connect(admin).upgradePlugins(impl.target);

      const beacon = await ethers.getContractAt('UpgradeableBeacon', await pluginFactory.beacon());
      expect(await beacon.implementation()).to.equal(impl.target);

      const Upgraded = await ethers.getContractFactory('UpgradedTradingHoursPluginTest');
      const plugin = Upgraded.attach(await pluginFactory.pluginByPool(mockPool.target)) as any;
      expect(await plugin.isUpgraded()).to.be.true;
    });

    it('should leave the configuration of an already-created plugin alone', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, owner, token0, token1, attachPlugin } = await loadFixture(deployFixture);
      await mockFactory.stubPool(token0, token1, mockPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);

      const plugin = await attachPlugin(mockPool);
      await plugin.connect(owner).setTradingHours(9 * 3600, 18 * 3600);
      await plugin.connect(owner).setBlockedWindow(1704067200, 0, 100, 200);
      await plugin.connect(owner).setEnabled(true);

      const impl = await upgradedImplementation(pluginFactory, mockFactory);
      await pluginFactory.connect(admin).upgradePlugins(impl.target);

      const [start, end] = await plugin.getTradingHours();
      expect([start, end]).to.deep.equal([BigInt(9 * 3600), BigInt(18 * 3600)]);
      expect(await plugin.getBlockedWeekdays()).to.equal(FACTORY_DEFAULTS.mask);
      expect(await plugin.getEnabled()).to.be.true;
      const [windowStart, windowEnd] = await plugin.getBlockedWindow(1704067200, 0);
      expect([windowStart, windowEnd]).to.deep.equal([100n, 200n]);
    });

    it('should hand the new implementation to plugins created afterwards', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, token0, token1 } = await loadFixture(deployFixture);

      const impl = await upgradedImplementation(pluginFactory, mockFactory);
      await pluginFactory.connect(admin).upgradePlugins(impl.target);

      await mockFactory.stubPool(token0, token1, mockPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);

      const Upgraded = await ethers.getContractFactory('UpgradedTradingHoursPluginTest');
      const plugin = Upgraded.attach(await pluginFactory.pluginByPool(mockPool.target)) as any;
      expect(await plugin.isUpgraded()).to.be.true;
      expect(await plugin.getBlockedWeekdays()).to.equal(FACTORY_DEFAULTS.mask); // still initialized as before
    });
  });

  describe('createPluginForExistingPool', function () {
    it('should reject a caller without POOLS_ADMINISTRATOR_ROLE', async function () {
      const { pluginFactory, mockFactory, mockPool, user, token0, token1 } = await loadFixture(deployFixture);

      await mockFactory.stubPool(token0, token1, mockPool.target);

      await expect(pluginFactory.connect(user).createPluginForExistingPool(token0, token1)).to.be.revertedWithoutReason();
    });

    it('should reject a pair with no pool', async function () {
      const { pluginFactory, admin, token0, token1 } = await loadFixture(deployFixture);

      await expect(pluginFactory.connect(admin).createPluginForExistingPool(token0, token1)).to.be.revertedWith(
        'Pool not exist'
      );
    });

    it('should create a plugin with the same defaults for the pools administrator', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, token0, token1, attachPlugin } = await loadFixture(deployFixture);

      await mockFactory.stubPool(token0, token1, mockPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);

      const plugin = await attachPlugin(mockPool);
      const [start, end] = await plugin.getTradingHours();
      expect([start, end]).to.deep.equal([BigInt(FACTORY_DEFAULTS.startSeconds), BigInt(FACTORY_DEFAULTS.endSeconds)]);
      expect(await plugin.getBlockedWeekdays()).to.equal(FACTORY_DEFAULTS.mask);
      expect(await plugin.getEnabled()).to.be.false;
    });

    it('should accept the Algebra factory owner without an explicit role', async function () {
      const { pluginFactory, mockFactory, mockPool, owner, token0, token1 } = await loadFixture(deployFixture);

      await mockFactory.stubPool(token0, token1, mockPool.target);
      await expect(pluginFactory.connect(owner).createPluginForExistingPool(token0, token1)).to.not.be.reverted;
    });

    it('should refuse a pool that already has a plugin', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, token0, token1 } = await loadFixture(deployFixture);

      await mockFactory.stubPool(token0, token1, mockPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);

      await expect(pluginFactory.connect(admin).createPluginForExistingPool(token0, token1)).to.be.revertedWith(
        'Already created'
      );
    });

    it('should give each pool its own plugin', async function () {
      const { pluginFactory, mockFactory, mockPool, admin, token0, token1 } = await loadFixture(deployFixture);

      const MockPool = await ethers.getContractFactory('MockPool');
      const otherPool = await MockPool.deploy();
      const token2 = '0x3333333333333333333333333333333333333333';

      await mockFactory.stubPool(token0, token1, mockPool.target);
      await mockFactory.stubPool(token0, token2, otherPool.target);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token1);
      await pluginFactory.connect(admin).createPluginForExistingPool(token0, token2);

      const first = await pluginFactory.pluginByPool(mockPool.target);
      const second = await pluginFactory.pluginByPool(otherPool.target);
      expect(first).to.not.equal(ethers.ZeroAddress);
      expect(second).to.not.equal(ethers.ZeroAddress);
      expect(first).to.not.equal(second);
    });
  });
});
