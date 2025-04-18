import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';

import { expect } from 'test-utils/expect';
import { PLUGIN_FLAGS, encodePriceSqrt} from 'test-utils/utilities';

import { MockPool, TestFeeDiscountPlugin, FeeDiscountRegistry, MockFactory } from '../typechain';

describe('AlgebraSecurityPlugin', () => {
  let wallet: Wallet, other: Wallet;

  let plugin: TestFeeDiscountPlugin; 
  let mockPool: MockPool; 
  let registry: FeeDiscountRegistry;
  let mockFactory: MockFactory;

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test AlgebaraSecurityPlugin', async () => {
    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;
  
    const mockPoolFactory = await ethers.getContractFactory('MockPool');
    mockPool = (await mockPoolFactory.deploy()) as any as MockPool;
  
    const registryFactory = await ethers.getContractFactory('FeeDiscountRegistry');
    registry = (await registryFactory.deploy(mockFactory)) as any as FeeDiscountRegistry;
  
    const pluginContractFactory = await ethers.getContractFactory('TestFeeDiscountPlugin');
    plugin = (await pluginContractFactory.deploy(mockPool, mockFactory, wallet.address, registry)) as any as TestFeeDiscountPlugin;

    await plugin.setFee(100);
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