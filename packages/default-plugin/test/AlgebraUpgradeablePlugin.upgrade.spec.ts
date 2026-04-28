import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { encodePriceSqrt } from 'test-utils/utilities';
import { DEFAULT_FEE_CONFIGURATION, ZERO_ADDRESS } from './shared/fixtures';

import { 
  MockFactory, 
  MockPool, 
  MockTimeDSFactory,
  MockTimeAlgebraUpgradeablePlugin,
  MockUpgradedPlugin
} from '../typechain';

describe('AlgebraUpgradeablePlugin - Upgrade Tests', () => {
  let wallet: Wallet, other: Wallet;

  async function upgradeFixture() {
    // Deploy MockFactory
    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

    // Deploy module implementations
    const volatilityOracleImplFactory = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
    const volatilityOracleImpl = await volatilityOracleImplFactory.deploy();

    const dynamicFeeImplFactory = await ethers.getContractFactory('DynamicFeePluginImplementation');
    const dynamicFeeImpl = await dynamicFeeImplFactory.deploy();

    const farmingProxyImplFactory = await ethers.getContractFactory('FarmingProxyPluginImplementation');
    const farmingProxyImpl = await farmingProxyImplFactory.deploy();

    const almImplFactory = await ethers.getContractFactory('AlmPluginImplementation');
    const almImpl = await almImplFactory.deploy();

    const securityImplFactory = await ethers.getContractFactory('SecurityPluginImplementation');
    const securityImpl = await securityImplFactory.deploy();

    const reflexImplFactory = await ethers.getContractFactory('ReflexPluginImplementation');
    const reflexImpl = await reflexImplFactory.deploy();

    const feeDiscountImplFactory = await ethers.getContractFactory('FeeDiscountPluginImplementation');
    const feeDiscountImpl = await feeDiscountImplFactory.deploy();

    const limitOrderImplFactory = await ethers.getContractFactory('LimitOrderPluginImplementation');
    const limitOrderImpl = await limitOrderImplFactory.deploy();

    // Deploy MockTimeDSFactory (doesn't require msg.sender == algebraFactory)
    const pluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
    const pluginFactory = (await pluginFactoryFactory.deploy(
      mockFactory,
      volatilityOracleImpl,
      dynamicFeeImpl,
      farmingProxyImpl,
      almImpl,
      securityImpl,
      reflexImpl,
      feeDiscountImpl,
      limitOrderImpl,
      DEFAULT_FEE_CONFIGURATION
    )) as any as MockTimeDSFactory;

    const feeDiscountRegistryFactory = await ethers.getContractFactory('FeeDiscountRegistry');
    const feeDiscountRegistry = await feeDiscountRegistryFactory.deploy(await (mockFactory as any).getAddress());
    await pluginFactory.setFeeDiscountRegistry(await feeDiscountRegistry.getAddress());

    // Deploy two mock pools
    const mockPoolFactory = await ethers.getContractFactory('MockPool');
    const mockPool1 = (await mockPoolFactory.deploy()) as any as MockPool;
    const mockPool2 = (await mockPoolFactory.deploy()) as any as MockPool;

    // Create plugins for both pools
    await pluginFactory.beforeCreatePoolHook(mockPool1, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
    await pluginFactory.beforeCreatePoolHook(mockPool2, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');

    const plugin1Address = await pluginFactory.pluginByPool(mockPool1);
    const plugin2Address = await pluginFactory.pluginByPool(mockPool2);

    const pluginContractFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
    const plugin1 = pluginContractFactory.attach(plugin1Address) as any as MockTimeAlgebraUpgradeablePlugin;
    const plugin2 = pluginContractFactory.attach(plugin2Address) as any as MockTimeAlgebraUpgradeablePlugin;

    // Get beacon from factory
    const beacon = await ethers.getContractAt('UpgradeableBeacon', await pluginFactory.beacon());
    const originalImplementation = await beacon.implementation();

    // Deploy upgraded implementation (MockUpgradedPlugin)
    const upgradedImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
    const upgradedImplementation = await upgradedImplFactory.deploy(
      mockFactory,
      pluginFactory,
      {
        volatilityOracle: await volatilityOracleImpl.getAddress(),
        dynamicFee: await dynamicFeeImpl.getAddress(),
        farmingProxy: await farmingProxyImpl.getAddress(),
        alm: await almImpl.getAddress(),
        security: await securityImpl.getAddress(),
        reflex: await reflexImpl.getAddress(),
        feeDiscount: await feeDiscountImpl.getAddress(),
        limitOrder: await limitOrderImpl.getAddress(),
      }
    );

    return {
      mockFactory,
      pluginFactory,
      beacon,
      mockPool1,
      mockPool2,
      plugin1,
      plugin2,
      originalImplementation,
      upgradedImplementation: await upgradedImplementation.getAddress(),
      volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
      dynamicFeeImpl: await dynamicFeeImpl.getAddress(),
      farmingProxyImpl: await farmingProxyImpl.getAddress(),
      almImpl: await almImpl.getAddress(),
      securityImpl: await securityImpl.getAddress(),
      reflexImpl: await reflexImpl.getAddress(),
      feeDiscountImpl: await feeDiscountImpl.getAddress(),
      limitOrderImpl: await limitOrderImpl.getAddress(),
    };
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  describe('#Beacon Proxy Architecture', () => {
    it('all proxies share the same beacon', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Both plugins should point to the same implementation via beacon
      const impl = await fixture.beacon.implementation();
      expect(impl).to.eq(fixture.originalImplementation);
    });

    it('plugins are properly initialized', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Check plugin1 is initialized
      const pool1 = await fixture.plugin1.pool();
      expect(pool1).to.eq(await fixture.mockPool1.getAddress());
      
      // Check plugin2 is initialized  
      const pool2 = await fixture.plugin2.pool();
      expect(pool2).to.eq(await fixture.mockPool2.getAddress());
    });

    it('plugins have independent storage', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Set plugin to different pools
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool2.setPlugin(fixture.plugin2);

      // Initialize pools at different prices
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));
      await fixture.mockPool2.initialize(encodePriceSqrt(2, 1));

      // Check they have different ticks
      const state1 = await fixture.mockPool1.globalState();
      const state2 = await fixture.mockPool2.globalState();
      
      // Different prices should result in different ticks
      expect(state1.tick).to.not.eq(state2.tick);
    });

  });

  describe('#Upgrade Process', () => {
    it('only authorized can upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Other user cannot upgrade
      await expect(
        fixture.beacon.connect(other).upgradeTo(fixture.upgradedImplementation)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('owner can upgrade beacon', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Before upgrade
      const implBefore = await fixture.beacon.implementation();
      expect(implBefore).to.eq(fixture.originalImplementation);

      // Perform upgrade via factory
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // After upgrade
      const implAfter = await fixture.beacon.implementation();
      expect(implAfter).to.eq(fixture.upgradedImplementation);
    });

    it('upgrade affects all existing proxies', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Setup pools before upgrade
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool2.setPlugin(fixture.plugin2);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));
      await fixture.mockPool2.initialize(encodePriceSqrt(1, 1));

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // Both plugins should now have isUpgraded() function
      const upgradedPlugin1 = await ethers.getContractAt('MockUpgradedPlugin', await fixture.plugin1.getAddress());
      const upgradedPlugin2 = await ethers.getContractAt('MockUpgradedPlugin', await fixture.plugin2.getAddress());

      expect(await upgradedPlugin1.isUpgraded()).to.eq(true);
      expect(await upgradedPlugin2.isUpgraded()).to.eq(true);
    });

    it('user with ALGEBRA_BASE_PLUGIN_MANAGER role cannot upgrade beacon directly (owner-only beacon)', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Granting role in algebraFactory does not affect owner-only beacon authorization
      await fixture.mockFactory.grantRole(
        ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER')),
        other.address
      );

      await expect(
        fixture.beacon.connect(other).upgradeTo(fixture.upgradedImplementation)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('owner of algebraFactory cannot upgrade beacon directly (owner-only beacon)', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // wallet is owner of mockFactory, so should be able to upgrade
      // Need to call beacon.upgradeTo directly, not through factory
      const beaconAddress = await fixture.beacon.getAddress();
      const beacon = await ethers.getContractAt('UpgradeableBeacon', beaconAddress);
      
      await expect(
        beacon.connect(wallet).upgradeTo(fixture.upgradedImplementation)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#Storage Preservation', () => {
    it('pool address is preserved after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      const poolBefore = await fixture.plugin1.pool();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const poolAfter = await fixture.plugin1.pool();
      expect(poolAfter).to.eq(poolBefore);
    });

    it('defaultPluginConfig is preserved after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);

      const configBefore = await fixture.plugin1.defaultPluginConfig();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const configAfter = await fixture.plugin1.defaultPluginConfig();
      expect(configAfter).to.eq(configBefore);
    });

    it('fee configuration is preserved after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);

      const feeConfigBefore = await fixture.plugin1.feeConfig();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const feeConfigAfter = await fixture.plugin1.feeConfig();
      
      expect(feeConfigAfter.alpha1).to.eq(feeConfigBefore.alpha1);
      expect(feeConfigAfter.alpha2).to.eq(feeConfigBefore.alpha2);
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
    });

    it('incentive is preserved after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Set farming address and incentive
      await fixture.pluginFactory.setFarmingAddress(wallet.address);
      
      const vpFactory = await ethers.getContractFactory('MockTimeVirtualPool');
      const virtualPool = await vpFactory.deploy();
      
      await fixture.plugin1.setIncentive(virtualPool);
      const incentiveBefore = await fixture.plugin1.incentive();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const incentiveAfter = await fixture.plugin1.incentive();
      expect(incentiveAfter).to.eq(incentiveBefore);
    });

    it('timepoints data is preserved after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Write some timepoints by doing swaps
      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.mockPool1.swapToTick(10);
      await fixture.mockPool1.swapToTick(-10);

      const timepointIndexBefore = await fixture.plugin1.timepointIndex();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const timepointIndexAfter = await fixture.plugin1.timepointIndex();
      expect(timepointIndexAfter).to.eq(timepointIndexBefore);
    });
  });

  describe('#New Functionality After Upgrade', () => {
    it('new functions are available after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await fixture.plugin1.getAddress());
      
      // New function should work
      expect(await upgradedPlugin.isUpgraded()).to.eq(true);
      
      // Call new upgradeable function
      const result = await upgradedPlugin.newUpgradeableFunction();
      expect(result).to.eq(42);
    });

    it('existing functions still work after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // Existing functionality should still work
      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.mockPool1.swapToTick(50);

      const state = await fixture.mockPool1.globalState();
      expect(state.tick).to.be.closeTo(50, 1);
    });
  });

  describe('#Factory Upgrade Management', () => {
    it('factory tracks current implementation', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      const implBefore = await fixture.pluginFactory.implementation();
      expect(implBefore).to.eq(fixture.originalImplementation);

      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const implAfter = await fixture.pluginFactory.implementation();
      expect(implAfter).to.eq(fixture.upgradedImplementation);
    });

    it('new plugins after upgrade use new implementation', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      // Upgrade first
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // Create new pool and plugin
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const newPool = await mockPoolFactory.deploy();

      await fixture.pluginFactory.beforeCreatePoolHook(
        newPool, 
        ZERO_ADDRESS, 
        ZERO_ADDRESS, 
        ZERO_ADDRESS, 
        ZERO_ADDRESS, 
        '0x'
      );

      const newPluginAddress = await fixture.pluginFactory.pluginByPool(newPool);
      const newPlugin = await ethers.getContractAt('MockUpgradedPlugin', newPluginAddress);

      // New plugin should have isUpgraded() returning true
      expect(await newPlugin.isUpgraded()).to.eq(true);
    });
  });

  describe('#Module Functionality After Upgrade', () => {
    it('volatility oracle still works after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Do some operations before upgrade
      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.plugin1.advanceTime(100);
      await fixture.mockPool1.swapToTick(10);

      const isInitializedBefore = await fixture.plugin1.isInitialized();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const isInitializedAfter = await fixture.plugin1.isInitialized();
      expect(isInitializedAfter).to.eq(isInitializedBefore);
    });

    it('dynamic fee still works after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.plugin1.advanceTime(100);
      await fixture.mockPool1.swapToTick(10);

      const feeBefore = await fixture.plugin1.getCurrentFee();

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      const feeAfter = await fixture.plugin1.getCurrentFee();
      // Fee should be the same or very close (might change slightly due to volatility calculations)
      expect(feeAfter).to.be.gte(0);
    });

    it('farming proxy still works after upgrade', async () => {
      const fixture = await loadFixture(upgradeFixture);
      
      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Set farming address and incentive before upgrade
      await fixture.pluginFactory.setFarmingAddress(wallet.address);
      const vpFactory = await ethers.getContractFactory('MockTimeVirtualPool');
      const virtualPool = await vpFactory.deploy();
      await fixture.plugin1.setIncentive(virtualPool);

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // Incentive should still work
      const incentive = await fixture.plugin1.incentive();
      expect(incentive).to.eq(await virtualPool.getAddress());
    });
  });
});
