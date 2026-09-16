import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

// No package in this repository builds on the non-upgradeable plugin bases, so they run here through minimal harnesses
describe('AbstractPlugin', function () {
  const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
  const MODULES = ['First Module', 'Second Module'];
  const PRICE = 2n ** 96n;

  async function deployFixture() {
    const [owner, manager, user, poolAccount, entryPoint] = await ethers.getSigners();

    const factory = await (await ethers.getContractFactory('PluginFactoryRolesMock')).deploy();
    await factory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    const Plugin = await ethers.getContractFactory('BaseAbstractPluginTest');
    // A mock pool contract, for what the plugin reads from and writes to its pool
    const pool = await (await ethers.getContractFactory('PluginPoolMock')).deploy();
    const plugin = await Plugin.deploy(pool.target, factory.target, owner.address, MODULES);
    await pool.setPlugin(plugin.target);
    // A pool that is a plain account, so a test can call the hooks as the pool
    const pluginOnAccount = await Plugin.deploy(poolAccount.address, factory.target, owner.address, MODULES);

    const token = await (await ethers.getContractFactory('PluginFeeTokenMock')).deploy();
    const customFactory = await (await ethers.getContractFactory('CustomPluginFactoryTest')).deploy(entryPoint.address, plugin.target);

    return { owner, manager, user, poolAccount, entryPoint, factory, pool, plugin, pluginOnAccount, token, customFactory };
  }

  describe('Hooks', function () {
    const hooks: [string, (user: string) => unknown[]][] = [
      ['beforeInitialize', (user) => [user, PRICE]],
      ['afterInitialize', (user) => [user, PRICE, 0]],
      ['beforeModifyPosition', (user) => [user, user, -60, 60, 1, '0x']],
      ['afterModifyPosition', (user) => [user, user, -60, 60, 1, 0, 0, '0x']],
      ['beforeSwap', (user) => [user, user, true, 1, PRICE, false, '0x']],
      ['afterSwap', (user) => [user, user, true, 1, PRICE, 1, -1, '0x']],
      ['beforeFlash', (user) => [user, user, 1, 1, '0x']],
      ['afterFlash', (user) => [user, user, 1, 1, 0, 0, '0x']],
      ['handlePluginFee', () => [1, 1]],
    ];

    for (const [hook, args] of hooks) {
      it(`should refuse ${hook} from anyone but the pool`, async function () {
        const { pluginOnAccount, user } = await loadFixture(deployFixture);

        await expect((pluginOnAccount.connect(user) as any)[hook](...args(user.address))).to.be.revertedWithCustomError(
          pluginOnAccount,
          'OnlyPool'
        );
      });

      it(`should answer ${hook} from the pool with its own selector`, async function () {
        const { pluginOnAccount, poolAccount, user } = await loadFixture(deployFixture);

        const result = await (pluginOnAccount.connect(poolAccount) as any)[hook].staticCall(...args(user.address));

        const selector = typeof result === 'string' ? result : result[0];
        expect(selector).to.equal(pluginOnAccount.interface.getFunction(hook)!.selector);
      });
    }
  });

  describe('Active modules', function () {
    it('should list every module it was built with', async function () {
      const { plugin } = await loadFixture(deployFixture);

      expect([...(await plugin.getActiveModuleNames())]).to.deep.equal(MODULES);
    });
  });

  describe('Plugin fee collection', function () {
    it('should refuse a caller with neither ownership nor the role', async function () {
      const { plugin, token, user } = await loadFixture(deployFixture);
      await token.transfer(plugin.target, 1000);

      // _authorize is a require with no reason string
      await expect(plugin.connect(user).collectPluginFee(token.target, 100, user.address)).to.be.revertedWithoutReason();
    });

    for (const role of ['manager', 'owner'] as const) {
      it(`should send the fee to the recipient when the ${role} collects it`, async function () {
        const fixture = await loadFixture(deployFixture);
        const { plugin, token, user } = fixture;
        await token.transfer(plugin.target, 1000);

        await plugin.connect(fixture[role]).collectPluginFee(token.target, 100, user.address);

        expect(await token.balanceOf(user.address)).to.equal(100);
        expect(await token.balanceOf(plugin.target)).to.equal(900);
      });
    }
  });

  describe('Plugin config in the pool', function () {
    it('should write a config that differs from the one the pool holds', async function () {
      const { plugin, pool } = await loadFixture(deployFixture);

      await plugin.updatePluginConfigInPool(7);

      expect(await pool.pluginConfig()).to.equal(7);
      expect(await pool.setPluginConfigCalls()).to.equal(1);
    });

    it('should leave the pool alone when it already holds the config', async function () {
      const { plugin, pool } = await loadFixture(deployFixture);
      await plugin.updatePluginConfigInPool(7);

      await plugin.updatePluginConfigInPool(7);

      expect(await pool.setPluginConfigCalls()).to.equal(1);
    });
  });

  describe('Custom plugin factory', function () {
    it('should refuse beforeCreatePoolHook from anyone but the entry point', async function () {
      const { customFactory, pool, user } = await loadFixture(deployFixture);

      await expect(
        customFactory.connect(user).beforeCreatePoolHook(pool.target, user.address, user.address, user.address, user.address, '0x')
      ).to.be.revertedWithoutReason();
    });

    it('should create the plugin when the entry point calls beforeCreatePoolHook', async function () {
      const { customFactory, pool, plugin, entryPoint, user } = await loadFixture(deployFixture);

      expect(
        await customFactory
          .connect(entryPoint)
          .beforeCreatePoolHook.staticCall(pool.target, user.address, user.address, user.address, user.address, '0x')
      ).to.equal(plugin.target);
    });

    it('should create a custom pool through the entry point', async function () {
      const { pool, owner, user } = await loadFixture(deployFixture);
      const entryPointMock = await (await ethers.getContractFactory('CustomPoolEntryPointMock')).deploy(pool.target);
      const factory = await (await ethers.getContractFactory('CustomPluginFactoryTest')).deploy(entryPointMock.target, pool.target);

      await factory.createCustomPool(user.address, owner.address, user.address, '0xbeef');

      // The factory names itself to the entry point and passes the rest through untouched
      expect(await entryPointMock.lastFactory()).to.equal(factory.target);
      expect(await entryPointMock.lastCreator()).to.equal(user.address);
      expect(await entryPointMock.lastTokenA()).to.equal(owner.address);
      expect(await entryPointMock.lastTokenB()).to.equal(user.address);
      expect(await entryPointMock.lastData()).to.equal('0xbeef');
      expect(await factory.createCustomPool.staticCall(user.address, owner.address, user.address, '0xbeef')).to.equal(pool.target);
    });

    it('should refuse afterCreatePoolHook from anyone but the entry point', async function () {
      const { customFactory, pool, plugin, user } = await loadFixture(deployFixture);

      await expect(customFactory.connect(user).afterCreatePoolHook(plugin.target, pool.target, user.address)).to.be.revertedWithoutReason();
    });

    it('should accept afterCreatePoolHook from the entry point', async function () {
      const { customFactory, pool, plugin, entryPoint, user } = await loadFixture(deployFixture);

      await expect(customFactory.connect(entryPoint).afterCreatePoolHook(plugin.target, pool.target, user.address)).to.not.be.reverted;
    });
  });
});
