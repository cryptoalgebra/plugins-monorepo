import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from './shared/expect';
import { feeDiscountPluginFixture } from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, expandTo18Decimals, getMaxTick, getMinTick } from './shared/utilities';

import { MockPool, AlgebraFeeDiscountPlugin, FeeDiscountPluginFactory, FeeDiscountRegistry, MockFactory } from '../typechain';

import snapshotGasCost from './shared/snapshotGasCost';
import { feeDiscountPuginFactorySol } from '../typechain/factories/contracts';

describe('AlgebraSecurityPlugin', () => {
  let wallet: Wallet, other: Wallet;

  let plugin: AlgebraFeeDiscountPlugin; 
  let mockPool: MockPool; // mock of AlgebraPool
  let pluginFactory: FeeDiscountPluginFactory;
  let registry: FeeDiscountRegistry;
  let mockFactory: MockFactory;
  async function initializeAtZeroTick(pool: MockPool) {
    await pool.initialize(encodePriceSqrt(1, 1));
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test AlgebaraSecurityPlugin', async () => {
    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

    const pluginFactoryFactory = await ethers.getContractFactory('FeeDiscountPluginFactory');
    const pluginFactory = (await pluginFactoryFactory.deploy(mockFactory)) as any as FeeDiscountPluginFactory;
  
    const mockPoolFactory = await ethers.getContractFactory('MockPool');
    const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;
  
    const registryFactory = await ethers.getContractFactory('FeeDiscountRegistry');
    const registry = (await registryFactory.deploy(mockFactory)) as any as FeeDiscountRegistry;
  
    await pluginFactory.setFeeDiscountRegistry(registry)
    await mockFactory.beforeCreatePoolHook(pluginFactory, mockPool);
    const pluginAddress = await pluginFactory.pluginByPool(mockPool);
  
    const pluginContractFactory = await ethers.getContractFactory('AlgebraFeeDiscountPlugin');
    const plugin = pluginContractFactory.attach(pluginAddress) as any as AlgebraFeeDiscountPlugin;
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

      it('resets config after afterModifyPosition', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
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

  describe('#FeeDiscountPlugin', () => {
    let defaultConfig: bigint;
    let defaultFee: bigint;

    beforeEach('initialize pool', async () => {
      defaultConfig = await plugin.defaultPluginConfig();
      await mockPool.setPlugin(plugin);
      await mockPool.initialize(encodePriceSqrt(1, 1));
      defaultFee = 100n;
    });

    describe('default fee discount 0% ', async () => {
      it('works correct', async () => {
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee);
      });
    });

    describe('fee discount 30%', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [await mockPool.getAddress()], [300])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 7n / 10n);
      });
    });

    describe('fee discount 50%', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [await mockPool.getAddress()], [500])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 1n / 2n);
      });
    });

    describe('fee discount 100%', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [await mockPool.getAddress()], [1000])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 0n);
      });
    });
  })

  describe('AlgebarFeeDiscountPlugin external methods', () => {
     
    it('set registry contract works correct', async () => {
      await plugin.setFeeDiscountRegistry(ZeroAddress);
      await expect(plugin.setFeeDiscountRegistry(registry)).to.emit(plugin, 'FeeDiscountRegistry');
      expect(await plugin.feeDiscountRegistry()).to.be.eq(registry);
    });

    it('only owner can set registry address', async () => {
      await expect(plugin.connect(other).setFeeDiscountRegistry(ZeroAddress)).to.be.reverted;
    });

  });

  describe('#FeeDiscountRegistry', () => {

    describe('#setFeeDiscount', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [await mockPool.getAddress()], [500])
        await registry.setFeeDiscount(other.address, [await mockPool.getAddress()], [400])
        expect(await registry.feeDiscounts(wallet.address, await mockPool.getAddress())).to.be.eq(500);
        expect(await registry.feeDiscounts(other.address, await mockPool.getAddress())).to.be.eq(400);        
      });

      it('only owner or with fee discount manager can set discounts', async () => {
        await expect(registry.connect(other).setFeeDiscount(wallet.address, [await mockPool.getAddress()], [500])).to.be.reverted
        await mockFactory.grantRole(await registry.FEE_DISCOUNT_MANAGER(), other.address);
        await expect(registry.connect(other).setFeeDiscount(wallet.address, [await mockPool.getAddress()], [500])).to.not.be.reverted
        await expect(registry.connect(wallet).setFeeDiscount(wallet.address, [await mockPool.getAddress()], [500])).to.not.be.reverted
      });

    });

  });

});