import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';

import { expect } from 'test-utils/expect';
import { encodePriceSqrt } from 'test-utils/utilities';

import {
  BeaconProxyDeployer,
  BeaconProxyDeployer__factory,
  FeeDiscountPluginImplementation,
  FeeDiscountPluginImplementation__factory,
  FeeDiscountRegistry,
  FeeDiscountRegistry__factory,
  MockFactory,
  MockFactory__factory,
  MockPool,
  MockPool__factory,
  UpgradeableBeacon,
  UpgradeableBeacon__factory,
  UpgradeableFeeDiscountPluginTest,
  UpgradeableFeeDiscountPluginTest__factory,
} from '../typechain';


describe('AlgebraFeeDiscountPlugin', () => {
  let wallet: HardhatEthersSigner, other: HardhatEthersSigner;

  let plugin: UpgradeableFeeDiscountPluginTest;
  let mockPool: MockPool;
  let registry: FeeDiscountRegistry;
  let mockFactory: MockFactory;

  before('prepare signers', async () => {
    [wallet, other] = await ethers.getSigners();
  });

  beforeEach('deploy test AlgebraFeeDiscountPlugin', async () => {
    mockFactory = await new MockFactory__factory(wallet).deploy();
    mockPool = await new MockPool__factory(wallet).deploy();
    registry = await new FeeDiscountRegistry__factory(wallet).deploy(mockFactory.target);

    const feeDiscountImpl: FeeDiscountPluginImplementation =
      await new FeeDiscountPluginImplementation__factory(wallet).deploy();

    const proxyDeployer: BeaconProxyDeployer = await new BeaconProxyDeployer__factory(wallet).deploy();

    const pluginImplementation: UpgradeableFeeDiscountPluginTest =
      await new UpgradeableFeeDiscountPluginTest__factory(wallet).deploy(
        mockFactory.target,
        proxyDeployer.target,
        feeDiscountImpl.target
      );

    const beacon: UpgradeableBeacon = await new UpgradeableBeacon__factory(wallet).deploy(
      pluginImplementation.target
    );

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      registry.target,
    ]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxyAddress = await proxyDeployer.lastDeployedProxy();

    plugin = UpgradeableFeeDiscountPluginTest__factory.connect(proxyAddress, wallet);
  });

  describe('#FeeDiscountPlugin', () => {
    let defaultConfig: bigint;
    let defaultFee: bigint;

    beforeEach('initialize pool', async () => {
      defaultConfig = await plugin.defaultPluginConfig();
      await mockPool.setPlugin(plugin.target);
      await mockPool.initialize(encodePriceSqrt(1, 1));
      const state = await mockPool.globalState();
      defaultFee = state.fee;
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
        await registry.setFeeDiscount(wallet.address, [mockPool.target], [300])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 7n / 10n);
      });
    });

    describe('fee discount 50%', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [mockPool.target], [500])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 1n / 2n);
      });
    });

    describe('fee discount 100%', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [mockPool.target], [1000])
        await mockPool.swapToTick(10); 
        let overrideFee = await mockPool.overrideFee()
 
        expect(overrideFee).to.be.eq(defaultFee * 0n);
      });
    });
  })

  describe('AlgebarFeeDiscountPlugin external methods', () => {
     
    it('set registry contract works correct', async () => {
      await plugin.setFeeDiscountRegistry(ZeroAddress);
      await expect(plugin.setFeeDiscountRegistry(registry.target)).to.emit(plugin, 'FeeDiscountRegistry');
      expect(await plugin.feeDiscountRegistry()).to.be.eq(registry.target);
    });

    it('only owner can set registry address', async () => {
      await expect(plugin.connect(other).setFeeDiscountRegistry(ZeroAddress)).to.be.reverted;
    });

  });

  describe('#FeeDiscountRegistry', () => {

    describe('#setFeeDiscount', async () => {
      it('works correct', async () => {
        await registry.setFeeDiscount(wallet.address, [mockPool.target], [500])
        await registry.setFeeDiscount(other.address, [mockPool.target], [400])
        expect(await registry.feeDiscounts(wallet.address, mockPool.target)).to.be.eq(500);
        expect(await registry.feeDiscounts(other.address, mockPool.target)).to.be.eq(400);        
      });

      it('only owner or with fee discount manager can set discounts', async () => {
        await expect(registry.connect(other).setFeeDiscount(wallet.address, [mockPool.target], [500])).to.be.reverted
        await mockFactory.grantRole(await registry.FEE_DISCOUNT_MANAGER(), other.address);
        await expect(registry.connect(other).setFeeDiscount(wallet.address, [mockPool.target], [500])).to.not.be.reverted
        await expect(registry.connect(wallet).setFeeDiscount(wallet.address, [mockPool.target], [500])).to.not.be.reverted
      });

    });

  });

});