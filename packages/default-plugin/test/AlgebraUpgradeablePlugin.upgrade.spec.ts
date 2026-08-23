import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { encodePriceSqrt } from 'test-utils/utilities';
import { ZERO_ADDRESS, deployImplementations, deployPluginFactory, impersonateAlgebraFactory, withImpl } from './shared/fixtures';

import { 
  MockFactory, 
  MockPool, 
  MockTimeAlgebraUpgradeablePlugin,
  MockUpgradedPlugin
} from '../typechain';

describe('AlgebraUpgradeablePlugin - Upgrade Tests', () => {
  let wallet: Wallet, other: Wallet;

  async function upgradeFixture() {
    // Deploy MockFactory
    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

    const implementations = await deployImplementations();
    const { mockPluginFactory: pluginFactory } = await deployPluginFactory(mockFactory, implementations);
    const algebraFactorySigner = await impersonateAlgebraFactory(mockFactory);

    // Deploy two mock pools
    const mockPoolFactory = await ethers.getContractFactory('MockPool');
    const mockPool1 = (await mockPoolFactory.deploy()) as any as MockPool;
    const mockPool2 = (await mockPoolFactory.deploy()) as any as MockPool;

    // Create plugins for both pools
    await pluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(mockPool1, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
    await pluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(mockPool2, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');

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
    const upgradedImplementation = await upgradedImplFactory.deploy(mockFactory, pluginFactory, implementations);

    return {
      mockFactory,
      pluginFactory,
      beacon,
      mockPool1,
      mockPool2,
      plugin1,
      plugin2,
      algebraFactorySigner,
      originalImplementation,
      upgradedImplementation: await upgradedImplementation.getAddress(),
      implementations
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

      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool2.setPlugin(fixture.plugin2);

      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));
      await fixture.mockPool2.initialize(encodePriceSqrt(2, 1));

      // Only pool1 sees activity, so only plugin1 writes further timepoints
      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.plugin1.advanceTime(60);
      await fixture.mockPool1.swapToTick(10);
      await fixture.plugin1.advanceTime(60);
      await fixture.mockPool1.swapToTick(-10);

      // Oracle state diverged even though both proxies share one implementation
      expect(await fixture.plugin1.timepointIndex()).to.be.gt(await fixture.plugin2.timepointIndex());
      expect(await fixture.plugin1.lastTimepointTimestamp()).to.be.gt(await fixture.plugin2.lastTimepointTimestamp());

      // Each proxy still resolves its own pool
      expect(await fixture.plugin1.pool()).to.eq(await fixture.mockPool1.getAddress());
      expect(await fixture.plugin2.pool()).to.eq(await fixture.mockPool2.getAddress());

      // Farming state written on plugin1 does not leak into plugin2
      await fixture.pluginFactory.setFarmingAddress(wallet.address);
      const virtualPool = await (await ethers.getContractFactory('MockTimeVirtualPool')).deploy();
      await fixture.plugin1.setIncentive(virtualPool);
      expect(await fixture.plugin1.incentive()).to.eq(await virtualPool.getAddress());
      expect(await fixture.plugin2.incentive()).to.eq(ZeroAddress);
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

      await fixture.pluginFactory.connect(fixture.algebraFactorySigner).beforeCreatePoolHook(
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

      const feeConfigBefore = await fixture.plugin1.feeConfig();
      const feeBefore = await fixture.plugin1.getCurrentFee();
      expect(feeBefore).to.be.gte(feeConfigBefore.baseFee);

      // Upgrade
      await fixture.pluginFactory.upgradePlugins(fixture.upgradedImplementation);

      // The fee may move, MockUpgradedPlugin reads block.timestamp. The config it derives from must not.
      const feeConfigAfter = await fixture.plugin1.feeConfig();
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
      expect(feeConfigAfter.alpha1).to.eq(feeConfigBefore.alpha1);
      expect(feeConfigAfter.alpha2).to.eq(feeConfigBefore.alpha2);

      // AdaptiveFee caps the result at baseFee + alpha1 + alpha2
      const feeAfter = await fixture.plugin1.getCurrentFee();
      expect(feeAfter).to.be.gte(feeConfigAfter.baseFee);
      expect(feeAfter).to.be.lte(feeConfigAfter.baseFee + feeConfigAfter.alpha1 + feeConfigAfter.alpha2);
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

  describe('#V2 storage namespace isolation', () => {
    // Deploy a V2 implementation for every module and a plugin that composes all five
    async function upgradeToSuperPlugin(fixture: any) {
      const v2 = await Promise.all(
        [
          'MockUpgradedVolatilityOraclePluginImplementation',
          'MockUpgradedDynamicFeePluginImplementation',
          'MockUpgradedFarmingProxyPluginImplementation',
          'MockUpgradedALMPluginImplementation',
          'MockUpgradedSecurityPluginImplementation',
        ].map(async (name) => (await (await ethers.getContractFactory(name)).deploy()).getAddress())
      );

      const superPlugin = await (await ethers.getContractFactory('MockSuperUpgradedPlugin')).deploy(fixture.mockFactory, fixture.pluginFactory, {
        volatilityOracle: v2[0],
        dynamicFee: v2[1],
        farmingProxy: v2[2],
        alm: v2[3],
        security: v2[4],
      });

      await fixture.pluginFactory.upgradePlugins(superPlugin);
      return ethers.getContractAt('MockSuperUpgradedPlugin', await fixture.plugin1.getAddress());
    }

    it('writing every V2 module field leaves all V1 state untouched', async () => {
      const fixture = await loadFixture(upgradeFixture);

      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.plugin1.advanceTime(100000);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      // Give every module something of its own to lose
      await fixture.pluginFactory.setFarmingAddress(wallet.address);
      const virtualPool = await (await ethers.getContractFactory('MockTimeVirtualPool')).deploy();
      await fixture.plugin1.setIncentive(virtualPool);

      const registry = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();
      await fixture.plugin1.setSecurityRegistry(registry);

      const rebalanceManager = await (await ethers.getContractFactory('MockRebalanceManager')).deploy();
      await fixture.plugin1.initializeALM(rebalanceManager, 3600, 600);

      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');
      await fixture.plugin1.advanceTime(60);
      await fixture.mockPool1.swapToTick(30);

      const before = {
        pool: await fixture.plugin1.pool(),
        pluginConfig: await fixture.plugin1.defaultPluginConfig(),
        feeConfig: await fixture.plugin1.feeConfig(),
        timepointIndex: await fixture.plugin1.timepointIndex(),
        lastTimepointTimestamp: await fixture.plugin1.lastTimepointTimestamp(),
        timepoint0: await fixture.plugin1.timepoints(0),
        incentive: await fixture.plugin1.incentive(),
        rebalanceManager: await fixture.plugin1.rebalanceManager(),
        slowTwapPeriod: await fixture.plugin1.slowTwapPeriod(),
        fastTwapPeriod: await fixture.plugin1.fastTwapPeriod(),
        securityRegistry: await fixture.plugin1.getSecurityRegistry(),
      };

      const upgraded = await upgradeToSuperPlugin(fixture);

      // Every module now runs its V2 implementation
      expect(await upgraded.hasUpgradedVolatilityImpl.staticCall()).to.eq(true);
      expect(await upgraded.hasUpgradedDynamicFeeImpl.staticCall()).to.eq(true);
      expect(await upgraded.hasUpgradedFarmingImpl.staticCall()).to.eq(true);
      expect(await upgraded.hasUpgradedAlmImpl.staticCall()).to.eq(true);
      expect(await upgraded.hasUpgradedSecurityImpl.staticCall()).to.eq(true);

      // Write into all five V2 namespaces
      await upgraded.setVolatilityEnhancedMode(true);
      await upgraded.setAdvancedFeeMode(true);
      await upgraded.setFarmingPausedMode(true);
      await upgraded.setAlmAdvancedMode(true);
      await upgraded.setSecurityEmergencyMode(true);

      expect(await upgraded.getVolatilityEnhancedMode.staticCall()).to.eq(true);
      expect(await upgraded.getAdvancedFeeMode.staticCall()).to.eq(true);
      expect(await upgraded.getFarmingPausedMode.staticCall()).to.eq(true);
      expect(await upgraded.getAlmAdvancedMode.staticCall()).to.eq(true);
      expect(await upgraded.getSecurityEmergencyMode.staticCall()).to.eq(true);

      // Not one V1 field moved
      expect(await upgraded.pool()).to.eq(before.pool);
      expect(await upgraded.defaultPluginConfig()).to.eq(before.pluginConfig);

      const feeConfigAfter = await upgraded.feeConfig.staticCall();
      expect(feeConfigAfter.alpha1).to.eq(before.feeConfig.alpha1);
      expect(feeConfigAfter.alpha2).to.eq(before.feeConfig.alpha2);
      expect(feeConfigAfter.beta1).to.eq(before.feeConfig.beta1);
      expect(feeConfigAfter.beta2).to.eq(before.feeConfig.beta2);
      expect(feeConfigAfter.gamma1).to.eq(before.feeConfig.gamma1);
      expect(feeConfigAfter.gamma2).to.eq(before.feeConfig.gamma2);
      expect(feeConfigAfter.baseFee).to.eq(before.feeConfig.baseFee);

      expect(await upgraded.timepointIndex()).to.eq(before.timepointIndex);
      expect(await upgraded.lastTimepointTimestamp()).to.eq(before.lastTimepointTimestamp);

      const timepoint0After = await upgraded.timepoints(0);
      expect(timepoint0After.initialized).to.eq(before.timepoint0.initialized);
      expect(timepoint0After.blockTimestamp).to.eq(before.timepoint0.blockTimestamp);
      expect(timepoint0After.tickCumulative).to.eq(before.timepoint0.tickCumulative);
      expect(timepoint0After.volatilityCumulative).to.eq(before.timepoint0.volatilityCumulative);
      expect(timepoint0After.tick).to.eq(before.timepoint0.tick);

      expect(await upgraded.incentive()).to.eq(before.incentive);

      expect(await upgraded.rebalanceManager()).to.eq(before.rebalanceManager);
      expect(await upgraded.slowTwapPeriod()).to.eq(before.slowTwapPeriod);
      expect(await upgraded.fastTwapPeriod()).to.eq(before.fastTwapPeriod);

      expect(await upgraded.getSecurityRegistry()).to.eq(before.securityRegistry);
    });

    it('each V2 namespace is independent of the others', async () => {
      const fixture = await loadFixture(upgradeFixture);

      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));

      const upgraded = await upgradeToSuperPlugin(fixture);

      // Turning one module's flag on must not drag the others with it
      await upgraded.setAlmAdvancedMode(true);

      expect(await upgraded.getAlmAdvancedMode.staticCall()).to.eq(true);
      expect(await upgraded.getVolatilityEnhancedMode.staticCall()).to.eq(false);
      expect(await upgraded.getAdvancedFeeMode.staticCall()).to.eq(false);
      expect(await upgraded.getFarmingPausedMode.staticCall()).to.eq(false);
      expect(await upgraded.getSecurityEmergencyMode.staticCall()).to.eq(false);

      // And turning it back off must not disturb one that was set in between
      await upgraded.setAdvancedFeeMode(true);
      await upgraded.setAlmAdvancedMode(false);

      expect(await upgraded.getAlmAdvancedMode.staticCall()).to.eq(false);
      expect(await upgraded.getAdvancedFeeMode.staticCall()).to.eq(true);
    });

    it('two proxies keep their V2 state apart', async () => {
      const fixture = await loadFixture(upgradeFixture);

      await fixture.mockPool1.setPlugin(fixture.plugin1);
      await fixture.mockPool2.setPlugin(fixture.plugin2);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));
      await fixture.mockPool2.initialize(encodePriceSqrt(1, 1));

      await upgradeToSuperPlugin(fixture);

      const upgraded1 = await ethers.getContractAt('MockSuperUpgradedPlugin', await fixture.plugin1.getAddress());
      const upgraded2 = await ethers.getContractAt('MockSuperUpgradedPlugin', await fixture.plugin2.getAddress());

      await upgraded1.setVolatilityEnhancedMode(true);
      await upgraded1.setSecurityEmergencyMode(true);

      expect(await upgraded2.getVolatilityEnhancedMode.staticCall()).to.eq(false);
      expect(await upgraded2.getSecurityEmergencyMode.staticCall()).to.eq(false);
    });
  });

  describe('#Upgraded FarmingProxy Module', () => {
    it('paused farming leaves the virtual pool untouched but still counts updates', async () => {
      const fixture = await loadFixture(upgradeFixture);

      // Swap the farming module for the V2 implementation
      const upgradedFarmingFactory = await ethers.getContractFactory('MockUpgradedFarmingProxyPluginImplementation');
      const upgradedFarming = await upgradedFarmingFactory.deploy();

      const newPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewFarming');
      const newPluginImpl = await newPluginFactory.deploy(
        fixture.mockFactory,
        fixture.pluginFactory,
        withImpl(fixture.implementations, { farmingProxy: await upgradedFarming.getAddress() })
      );
      await fixture.pluginFactory.upgradePlugins(newPluginImpl);

      const upgraded = await ethers.getContractAt('MockUpgradedPluginWithNewFarming', await fixture.plugin1.getAddress());

      // Attach a virtual pool as incentive
      await fixture.mockPool1.setPlugin(upgraded);
      await fixture.mockPool1.initialize(encodePriceSqrt(1, 1));
      await fixture.pluginFactory.setFarmingAddress(wallet.address);
      const virtualPool = await (await ethers.getContractFactory('MockTimeVirtualPool')).deploy();
      await upgraded.setIncentive(virtualPool);

      await fixture.mockPool1.mint(wallet.address, wallet.address, -120, 120, 1000000, '0x');

      // Not paused: the virtual pool follows the pool tick
      await fixture.mockPool1.swapToTick(10);
      expect(await virtualPool.currentTick()).to.eq((await fixture.mockPool1.globalState()).tick);

      const statsBefore = await upgraded.getFarmingUpdateStats.staticCall();

      // Paused: crossTo is skipped, the update counter still moves
      await upgraded.setFarmingPausedMode(true);
      const tickWhilePaused = await virtualPool.currentTick();
      await fixture.mockPool1.swapToTick(-10);

      expect(await virtualPool.currentTick()).to.eq(tickWhilePaused);
      expect((await fixture.mockPool1.globalState()).tick).to.not.eq(tickWhilePaused);

      const statsAfter = await upgraded.getFarmingUpdateStats.staticCall();
      expect(statsAfter.updateCount).to.be.gt(statsBefore.updateCount);
    });
  });
});
