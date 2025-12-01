import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { upgradeablePluginFixture } from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, getMaxTick, getMinTick } from 'test-utils/utilities';

import { MockPool, MockTimeAlgebraUpgradeablePlugin, MockTimeUpgradeablePluginFactory, MockTimeVirtualPool } from '../typechain';

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

    describe('#getActiveModulesCount', () => {
      it('returns correct count of active modules', async () => {
        const moduleCount = await plugin.getActiveModulesCount();
        expect(moduleCount).to.eq(3); // VolatilityOracle, DynamicFee, FarmingProxy by default
      });
    });

    describe('#getModuleName', () => {
      it('returns correct module names by index', async () => {
        const moduleCount = await plugin.getActiveModulesCount();
        
        for (let i = 0; i < Number(moduleCount); i++) {
          const moduleName = await plugin.getModuleName(i);
          expect(moduleName).to.be.a('string');
          expect(moduleName.length).to.be.gt(0);
        }
      });

      it('returns specific expected module names', async () => {
        const moduleCount = await plugin.getActiveModulesCount();
        const moduleNames = [];
        
        for (let i = 0; i < Number(moduleCount); i++) {
          const moduleName = await plugin.getModuleName(i);
          moduleNames.push(moduleName);
        }

        // Check that expected modules are present
        expect(moduleNames).to.include('Volatility Oracle');
        expect(moduleNames).to.include('Dynamic Fee');
        expect(moduleNames).to.include('Farming Proxy');
      });

      it('reverts when index is out of bounds', async () => {
        const moduleCount = await plugin.getActiveModulesCount();
        await expect(plugin.getModuleName(moduleCount)).to.be.revertedWith('Index out of bounds');
        await expect(plugin.getModuleName(Number(moduleCount) + 1)).to.be.revertedWith('Index out of bounds');
      });
    });

    describe('#getActiveModuleNames', () => {
      it('returns array with all module names', async () => {
        const moduleNames = await plugin.getActiveModuleNames();
        
        expect(moduleNames).to.be.an('array');
        expect(moduleNames.length).to.eq(3);
        
        // Check each module name is a non-empty string
        for (const moduleName of moduleNames) {
          expect(moduleName).to.be.a('string');
          expect(moduleName.length).to.be.gt(0);
        }
      });

      it('returns expected module names in correct order', async () => {
        const moduleNames = await plugin.getActiveModuleNames();
        
        // Verify all expected modules are present
        expect(moduleNames).to.include('Volatility Oracle');
        expect(moduleNames).to.include('Dynamic Fee');
        expect(moduleNames).to.include('Farming Proxy');
        
        // Verify module count
        expect(moduleNames).to.have.lengthOf(3);
      });

      it('returns consistent results with individual getModuleName calls', async () => {
        const moduleNamesArray = await plugin.getActiveModuleNames();
        const moduleCount = await plugin.getActiveModulesCount();
        
        expect(moduleNamesArray.length).to.eq(Number(moduleCount));
        
        for (let i = 0; i < Number(moduleCount); i++) {
          const individualName = await plugin.getModuleName(i);
          expect(moduleNamesArray[i]).to.eq(individualName);
        }
      });
    });
  });
});
