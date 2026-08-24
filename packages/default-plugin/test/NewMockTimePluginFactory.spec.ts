import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { pinnedMockTimePluginFactory } from './shared/pinnedFactory';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { ZERO_ADDRESS, DEFAULT_FEE_CONFIGURATION, newMockTimeUpgradeablePluginFactoryFixture, withImpl, impersonateAlgebraFactory, ModuleImplementations } from './shared/fixtures';

import { MockFactory, NewMockTimeUpgradeablePluginFactory, MockTimeAlgebraUpgradeablePlugin } from '../typechain';

describe('NewMockTimeUpgradeablePluginFactory', () => {
  let wallet: Wallet, other: Wallet, almManager: Wallet;

  let mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  let factoryImpl: any;
  let proxyAdmin: any;
  let proxyAdminOwner: any;
  let mockAlgebraFactory: MockFactory;
  // beforeCreatePoolHook is only callable by the Algebra factory, so the tests drive it from that address
  let algebraFactorySigner: any;
  let implementations: ModuleImplementations;

  before('prepare signers', async () => {
    [wallet, other, almManager] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test pluginFactory', async () => {
    ({ 
      mockPluginFactory, 
      factoryImpl, 
      proxyAdmin, 
      proxyAdminOwner, 
      mockFactory: mockAlgebraFactory,
      implementations 
    } = await loadFixture(newMockTimeUpgradeablePluginFactoryFixture));
    algebraFactorySigner = await impersonateAlgebraFactory(mockAlgebraFactory);
  });

  // Deploy a plugin implementation wired to the mock factories
  async function deployPluginImpl(contractName: string, impls: ModuleImplementations = implementations) {
    const implFactory = await ethers.getContractFactory(contractName);
    return implFactory.deploy(await mockAlgebraFactory.getAddress(), await mockPluginFactory.getAddress(), impls);
  }

  // Deploy a plugin implementation and point the beacon at it
  async function upgradePluginsTo(contractName: string, impls: ModuleImplementations = implementations) {
    const newImpl = await deployPluginImpl(contractName, impls);
    await mockPluginFactory.upgradePlugins(await newImpl.getAddress());
    return newImpl;
  }

  // Thin subclass of the production factory: adds only the ALM defaults and setPluginForPool.
  // Everything inherited is covered in AlgebraUpgradeablePluginFactory.spec.ts.

  // ========== FACTORY UPGRADE ==========

  describe('#Factory Upgrade via ProxyAdmin', () => {
    it('preserves storage after factory upgrade', async () => {
      // Set configurations before upgrade
      await mockPluginFactory.setFarmingAddress(other.address);
      await mockPluginFactory.setSecurityRegistry(other.address);
      await mockPluginFactory.setDefaultRebalanceManager(almManager.address);
      await mockPluginFactory.setDefaultAlmTwapPeriods(3600, 600);

      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();
      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(), 
        await newFactoryImpl.getAddress()
      );

      // Verify storage preserved
      expect(await mockPluginFactory.farmingAddress()).to.eq(other.address);
      expect(await mockPluginFactory.securityRegistry()).to.eq(other.address);
      expect(await mockPluginFactory.defaultRebalanceManager()).to.eq(almManager.address);
      expect(await mockPluginFactory.defaultSlowTwapPeriod()).to.eq(3600);
      expect(await mockPluginFactory.defaultFastTwapPeriod()).to.eq(600);
    });
  });

  // ========== PLUGIN CREATION ==========

  describe('#Plugin Creation', () => {
    let mockPool: any;

    beforeEach('deploy mock pool', async () => {
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();
    });

    it('creates plugin for pool', async () => {
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      expect(pluginAddress).to.not.eq(ZERO_ADDRESS);
    });

    it('plugin has correct fee configuration', async () => {
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      const plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress);
      
      const feeConfig = await plugin.feeConfig.staticCall();
      expect(feeConfig.alpha1).to.eq(DEFAULT_FEE_CONFIGURATION.alpha1);
      expect(feeConfig.baseFee).to.eq(DEFAULT_FEE_CONFIGURATION.baseFee);
    });

    it('cannot create plugin twice for same pool', async () => {
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      await expect(
        mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
          await mockPool.getAddress(), 
          ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
        )
      ).to.be.revertedWithCustomError(mockPluginFactory, 'PluginAlreadyCreated');
    });
  });

  // ========== PLUGIN WITH ALM & SECURITY CONFIGURATION ==========

  describe('#Plugin Creation with ALM & Security', () => {
    let mockPool: any;

    beforeEach('setup ALM and Security config', async () => {
      // Set Security configuration BEFORE creating plugin
      await mockPluginFactory.setSecurityRegistry(other.address);

      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();
    });

    it('plugin receives security configuration', async () => {
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      const plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress);

      // Check security config was passed to plugin
      expect(await plugin.getSecurityRegistry()).to.eq(other.address);
    });
  });

  // ========== PLUGIN UPGRADE VIA BEACON ==========

  describe('#Plugin Upgrade via Beacon', () => {
    let mockPool: any;
    let plugin: MockTimeAlgebraUpgradeablePlugin;

    beforeEach('create plugin', async () => {
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;
    });

    it('can upgrade plugins', async () => {

      // Deploy MockUpgradedPlugin
      // Upgrade
      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Verify upgrade
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      expect(await upgradedPlugin.isUpgraded()).to.eq(true);
    });

    it('preserves storage after plugin upgrade', async () => {
      // Store some data
      const feeConfigBefore = await plugin.feeConfig.staticCall();
      const poolBefore = await plugin.pool();

      // Deploy and upgrade to MockUpgradedPlugin
      
      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Verify storage preserved
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const feeConfigAfter = await upgradedPlugin.feeConfig.staticCall();
      
      expect(feeConfigAfter.alpha1).to.eq(feeConfigBefore.alpha1);
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
      expect(await upgradedPlugin.pool()).to.eq(poolBefore);
    });
  });

  // ========== ALM SETTERS (harness only) ==========

  // Harness only setters, with no access control and no path into a created plugin.
  // ALM configuration reaches a plugin through its own initializeALM instead.
  describe('#ALM Configuration (harness only)', () => {
    describe('#setDefaultRebalanceManager', () => {
      it('updates defaultRebalanceManager', async () => {
        await mockPluginFactory.setDefaultRebalanceManager(almManager.address);
        expect(await mockPluginFactory.defaultRebalanceManager()).to.eq(almManager.address);
      });

      it('emits RebalanceManager event', async () => {
        await expect(mockPluginFactory.setDefaultRebalanceManager(almManager.address))
          .to.emit(mockPluginFactory, 'RebalanceManager')
          .withArgs(almManager.address);
      });
    });

    describe('#setDefaultAlmTwapPeriods', () => {
      it('updates TWAP periods', async () => {
        await mockPluginFactory.setDefaultAlmTwapPeriods(7200, 1200);
        expect(await mockPluginFactory.defaultSlowTwapPeriod()).to.eq(7200);
        expect(await mockPluginFactory.defaultFastTwapPeriod()).to.eq(1200);
      });

      it('emits AlmTwapPeriods event', async () => {
        await expect(mockPluginFactory.setDefaultAlmTwapPeriods(7200, 1200))
          .to.emit(mockPluginFactory, 'AlmTwapPeriods')
          .withArgs(7200, 1200);
      });

      it('reverts if slowPeriod < fastPeriod', async () => {
        await expect(
          mockPluginFactory.setDefaultAlmTwapPeriods(600, 3600)
        ).to.be.revertedWithCustomError(mockPluginFactory, 'InvalidAlmTwapPeriods');
      });

      it('accepts equal periods', async () => {
        // The guard is `slowPeriod < fastPeriod`, so equality is deliberately allowed
        await expect(mockPluginFactory.setDefaultAlmTwapPeriods(3600, 3600)).to.not.be.reverted;

        expect(await mockPluginFactory.defaultSlowTwapPeriod()).to.eq(3600);
        expect(await mockPluginFactory.defaultFastTwapPeriod()).to.eq(3600);
      });

      it('reverts one second below equality', async () => {
        await expect(
          mockPluginFactory.setDefaultAlmTwapPeriods(3599, 3600)
        ).to.be.revertedWithCustomError(mockPluginFactory, 'InvalidAlmTwapPeriods');
      });
    });
  });

  // Security, fee and farming setters are inherited, covered in AlgebraUpgradeablePluginFactory.spec.ts

  // ========== COMPLETE PLUGIN UPGRADE FLOW ==========

  describe('#Complete Plugin Upgrade Flow', () => {
    let mockPool: any;
    let mockPool2: any;
    let plugin: MockTimeAlgebraUpgradeablePlugin;
    let plugin2: MockTimeAlgebraUpgradeablePlugin;

    beforeEach('setup plugins with ALM & Security', async () => {
      // Configure factory with ALM and Security BEFORE creating plugins
      await mockPluginFactory.setSecurityRegistry(other.address);
      await mockPluginFactory.setDefaultRebalanceManager(almManager.address);
      await mockPluginFactory.setDefaultAlmTwapPeriods(3600, 600);
      await mockPluginFactory.setFarmingAddress(wallet.address);

      // Create two pools with plugins
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();
      mockPool2 = await mockPoolFactory.deploy();

      // Create plugin for pool 1
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;

      // Create plugin for pool 2
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool2.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress2 = await mockPluginFactory.pluginByPool(mockPool2.getAddress());
      plugin2 = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress2) as any;

      // Connect plugins and initialize pools
      await mockPool.setPlugin(pluginAddress);
      await mockPool2.setPlugin(pluginAddress2);

      const initialPrice = BigInt('79228162514264337593543950336'); // ~1.0
      await mockPool.initialize(initialPrice);
      await mockPool2.initialize(initialPrice);
    });

    it('upgrades ALL plugins at once via beacon', async () => {

      // Deploy new implementation
      // Single upgrade call affects ALL plugins
      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Both plugins now use new implementation
      const upgraded1 = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const upgraded2 = await ethers.getContractAt('MockUpgradedPlugin', await plugin2.getAddress());

      expect(await upgraded1.isUpgraded()).to.eq(true);
      expect(await upgraded2.isUpgraded()).to.eq(true);
    });

    it('preserves ALL storage after plugin upgrade', async () => {
      // Record state BEFORE upgrade
      const pool1Before = await plugin.pool();
      const pool2Before = await plugin2.pool();
      const feeConfig1Before = await plugin.feeConfig.staticCall();
      const feeConfig2Before = await plugin2.feeConfig.staticCall();
      // Factory ALM defaults never reach a created plugin, nothing calls initializeALM.
      // Pinned so that wiring them through would break here rather than pass quietly.
      const alm1Before = await plugin.rebalanceManager();
      expect(alm1Before).to.eq(ZERO_ADDRESS);
      expect(await mockPluginFactory.defaultRebalanceManager()).to.eq(almManager.address);

      const security1Before = await plugin.getSecurityRegistry();

      // Deploy and upgrade

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Verify ALL storage preserved
      const upgraded1 = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const upgraded2 = await ethers.getContractAt('MockUpgradedPlugin', await plugin2.getAddress());

      // Pool addresses preserved
      expect(await upgraded1.pool()).to.eq(pool1Before);
      expect(await upgraded2.pool()).to.eq(pool2Before);

      // Fee config preserved
      const feeConfig1After = await upgraded1.feeConfig.staticCall();
      const feeConfig2After = await upgraded2.feeConfig.staticCall();
      expect(feeConfig1After.alpha1).to.eq(feeConfig1Before.alpha1);
      expect(feeConfig1After.baseFee).to.eq(feeConfig1Before.baseFee);
      expect(feeConfig2After.alpha1).to.eq(feeConfig2Before.alpha1);

      // ALM storage is still uninitialized, and the upgrade did not invent values for it
      expect(await upgraded1.rebalanceManager()).to.eq(alm1Before);
      expect(await upgraded1.slowTwapPeriod()).to.eq(0);
      expect(await upgraded1.fastTwapPeriod()).to.eq(0);

      // Security config preserved
      expect(await upgraded1.getSecurityRegistry()).to.eq(security1Before);

    });

    it('new functions available after plugin upgrade', async () => {
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      const upgraded = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());

      // ========== NEW STORAGE SLOT (ERC-7201: algebra.storage.upgradetest) ==========
      
      // New functions from MockUpgradedPlugin
      expect(await upgraded.isUpgraded()).to.eq(true);
      expect(await upgraded.newUpgradeableFunction()).to.eq(42);

      // Can use new storage slot
      await upgraded.setNewVariable(12345);
      expect(await upgraded.getNewVariable()).to.eq(12345);

      // ========== OLD STORAGE SLOTS STILL ACCESSIBLE ==========
      
      // OLD: Base plugin storage (pool, pluginFactory, defaultPluginConfig, activeModules)
      expect(await upgraded.pool()).to.eq(await mockPool.getAddress());
      expect(await upgraded.pluginFactory()).to.eq(factoryAddress);
      expect(await upgraded.defaultPluginConfig()).to.not.eq(0);

      // OLD: DynamicFee storage (algebra.storage.dynamicfee)
      const feeConfig = await upgraded.feeConfig.staticCall();
      expect(feeConfig.alpha1).to.eq(DEFAULT_FEE_CONFIGURATION.alpha1);
      expect(feeConfig.baseFee).to.eq(DEFAULT_FEE_CONFIGURATION.baseFee);

      // OLD: VolatilityOracle storage (algebra.storage.volatilityoracle)
    
      // The pool was initialized and never swapped, so timepoint 0 is the only one written
      const timepointIndex = await upgraded.timepointIndex();
      expect(timepointIndex).to.eq(0);
      const timepoint0 = await upgraded.timepoints(0);
      expect(timepoint0.initialized).to.eq(true);

      // OLD: ALM storage (algebra.storage.alm)
      expect(await upgraded.rebalanceManager()).to.eq(ZERO_ADDRESS);
      expect(await upgraded.slowTwapPeriod()).to.eq(0);
      expect(await upgraded.fastTwapPeriod()).to.eq(0);

      // OLD: Security storage (algebra.storage.security)
      expect(await upgraded.getSecurityRegistry()).to.eq(other.address);

      // OLD: FarmingProxy storage (algebra.storage.farmingproxy)
      // incentive is initially address(0), but getter should work
      const incentive = await upgraded.incentive();
      expect(incentive).to.eq(ZERO_ADDRESS); // default

      // ========== VERIFY ALL NAMESPACES COEXIST ==========
      
      // Change new variable again to verify it's independent
      await upgraded.setNewVariable(99999);
      expect(await upgraded.getNewVariable()).to.eq(99999);

      // Old storage unchanged after modifying new storage
      expect(await upgraded.pool()).to.eq(await mockPool.getAddress());
      expect((await upgraded.feeConfig.staticCall()).baseFee).to.eq(DEFAULT_FEE_CONFIGURATION.baseFee);
    });

    it('existing functions still work after plugin upgrade', async () => {
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      const upgraded = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());

      // Old functions still work
      const feeConfig = await upgraded.feeConfig.staticCall();
      expect(feeConfig.baseFee).to.not.eq(0);

      expect(await upgraded.pool()).to.eq(await mockPool.getAddress());
      expect(await upgraded.pluginFactory()).to.eq(factoryAddress);
    });

    it('new plugins after upgrade use new implementation', async () => {

      // Upgrade plugins
      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Create NEW pool and plugin AFTER upgrade
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const newPool = await mockPoolFactory.deploy();

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await newPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const newPluginAddress = await mockPluginFactory.pluginByPool(newPool.getAddress());
      const newPlugin = await ethers.getContractAt('MockUpgradedPlugin', newPluginAddress);

      // New plugin uses upgraded implementation
      expect(await newPlugin.isUpgraded()).to.eq(true);
    });
  });

  // ========== COMPLETE FACTORY UPGRADE FLOW ==========

  describe('#Complete Factory Upgrade Flow', () => {
    let mockPool: any;

    beforeEach('setup factory with configs and plugin', async () => {
      // Set all configurations
      await mockPluginFactory.setFarmingAddress(wallet.address);
      await mockPluginFactory.setSecurityRegistry(other.address);
      await mockPluginFactory.setDefaultRebalanceManager(almManager.address);
      await mockPluginFactory.setDefaultAlmTwapPeriods(7200, 1200);

      const newFeeConfig = {
        alpha1: 5000,
        alpha2: 15000,
        beta1: 500,
        beta2: 70000,
        gamma1: 100,
        gamma2: 9000,
        baseFee: 200
      };
      await mockPluginFactory.setDefaultFeeConfiguration(newFeeConfig);

      // Create a plugin before upgrade
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
    });

    it('preserves beacon after factory upgrade', async () => {
      const beaconBefore = await mockPluginFactory.beacon();
      const implementationBefore = await mockPluginFactory.implementation();

      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Beacon preserved
      expect(await mockPluginFactory.beacon()).to.eq(beaconBefore);
      expect(await mockPluginFactory.implementation()).to.eq(implementationBefore);
    });

    it('preserves ALL configs after factory upgrade', async () => {
      // Record state
      const algebraFactoryBefore = await mockPluginFactory.algebraFactory();
      const farmingBefore = await mockPluginFactory.farmingAddress();
      const securityBefore = await mockPluginFactory.securityRegistry();
      const rebalanceManagerBefore = await mockPluginFactory.defaultRebalanceManager();
      const slowTwapBefore = await mockPluginFactory.defaultSlowTwapPeriod();
      const fastTwapBefore = await mockPluginFactory.defaultFastTwapPeriod();
      const feeConfigBefore = await mockPluginFactory.defaultFeeConfiguration();

      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // ALL configs preserved
      expect(await mockPluginFactory.algebraFactory()).to.eq(algebraFactoryBefore);
      expect(await mockPluginFactory.farmingAddress()).to.eq(farmingBefore);
      expect(await mockPluginFactory.securityRegistry()).to.eq(securityBefore);
      expect(await mockPluginFactory.defaultRebalanceManager()).to.eq(rebalanceManagerBefore);
      expect(await mockPluginFactory.defaultSlowTwapPeriod()).to.eq(slowTwapBefore);
      expect(await mockPluginFactory.defaultFastTwapPeriod()).to.eq(fastTwapBefore);

      const feeConfigAfter = await mockPluginFactory.defaultFeeConfiguration();
      expect(feeConfigAfter.alpha1).to.eq(feeConfigBefore.alpha1);
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
    });

    it('preserves pluginByPool mapping after factory upgrade', async () => {
      const pluginBefore = await mockPluginFactory.pluginByPool(mockPool.getAddress());

      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Plugin mapping preserved
      expect(await mockPluginFactory.pluginByPool(mockPool.getAddress())).to.eq(pluginBefore);
    });

    it('can create new plugins after factory upgrade', async () => {
      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Create NEW pool after factory upgrade
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const newPool = await mockPoolFactory.deploy();

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await newPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const newPluginAddress = await mockPluginFactory.pluginByPool(newPool.getAddress());
      expect(newPluginAddress).to.not.eq(ZERO_ADDRESS);

      // New plugin has correct config (inherited from factory)
      const newPlugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', newPluginAddress);
      expect(await newPlugin.rebalanceManager()).to.eq(ZERO_ADDRESS);
      expect(await newPlugin.getSecurityRegistry()).to.eq(other.address);
    });

    it('can modify configs after factory upgrade', async () => {
      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Can still modify configs
      const [, newWallet] = await ethers.getSigners();
      await mockPluginFactory.setDefaultRebalanceManager(newWallet.address);
      expect(await mockPluginFactory.defaultRebalanceManager()).to.eq(newWallet.address);

      await mockPluginFactory.setDefaultAlmTwapPeriods(9999, 1111);
      expect(await mockPluginFactory.defaultSlowTwapPeriod()).to.eq(9999);
      expect(await mockPluginFactory.defaultFastTwapPeriod()).to.eq(1111);
    });

    it('existing plugins still work after factory upgrade', async () => {
      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      const plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress);

      // Record plugin state
      const poolBefore = await plugin.pool();
      const feeConfigBefore = await plugin.feeConfig.staticCall();

      // Upgrade factory
      const newFactoryImplFactory = await pinnedMockTimePluginFactory();
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Existing plugin still works (factory upgrade doesn't affect plugins!)
      expect(await plugin.pool()).to.eq(poolBefore);
      const feeConfigAfter = await plugin.feeConfig.staticCall();
      
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
    });
  });

  // ========== SECURITY MODULE UPGRADE ==========

  describe('#Security Module Upgrade via Plugin Upgrade', () => {
    let mockPool: any;
    let mockPool2: any;
    let plugin: MockTimeAlgebraUpgradeablePlugin;
    let plugin2: MockTimeAlgebraUpgradeablePlugin;
    let securityRegistry: any;
    let upgradedSecurityImpl: any;

    beforeEach('setup pools with security', async () => {
      // Deploy MockSecurityRegistry
      const MockSecurityRegistryFactory = await ethers.getContractFactory('MockSecurityRegistry');
      securityRegistry = await MockSecurityRegistryFactory.deploy();

      // Configure factory with security BEFORE creating plugins
      await mockPluginFactory.setSecurityRegistry(await securityRegistry.getAddress());

      // Create two pools with plugins
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();
      mockPool2 = await mockPoolFactory.deploy();

      // Create plugins
      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool2.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress2 = await mockPluginFactory.pluginByPool(mockPool2.getAddress());
      plugin2 = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress2) as any;

      // Connect and initialize pools
      await mockPool.setPlugin(pluginAddress);
      await mockPool2.setPlugin(pluginAddress2);

      const initialPrice = BigInt('79228162514264337593543950336');
      await mockPool.initialize(initialPrice);
      await mockPool2.initialize(initialPrice);
    });

    it('security registry is preserved after upgrading to plugin with new security impl', async () => {
      // Record security registry BEFORE upgrade
      const securityRegistryBefore = await plugin.getSecurityRegistry();
      const securityRegistry2Before = await plugin2.getSecurityRegistry();
      expect(securityRegistryBefore).to.eq(await securityRegistry.getAddress());

      // Deploy new security implementation
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();

      // Deploy new plugin with upgraded security impl

      // Upgrade all plugins via beacon
      const newPluginImpl = await upgradePluginsTo('MockUpgradedPluginWithNewSecurity', withImpl(implementations, { security: await upgradedSecurityImpl.getAddress() }));

      // Verify security registry PRESERVED in both plugins
      const upgraded1 = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin.getAddress());
      const upgraded2 = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin2.getAddress());

      expect(await upgraded1.getSecurityRegistry()).to.eq(securityRegistryBefore);
      expect(await upgraded2.getSecurityRegistry()).to.eq(securityRegistry2Before);
    });

    it('new security functions available after upgrade', async () => {
      // Deploy upgraded security impl
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();

      // Deploy and upgrade plugin

      const newPluginImpl = await upgradePluginsTo('MockUpgradedPluginWithNewSecurity', withImpl(implementations, { security: await upgradedSecurityImpl.getAddress() }));

      const upgraded = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin.getAddress());

      // New V2 functions available
      expect(await upgraded.HAS_UPGRADED_SECURITY()).to.eq(true);
      expect(await upgraded.hasUpgradedSecurityImpl.staticCall()).to.eq(true);  // ← staticCall!

      // Emergency mode (new V2 feature)
      expect(await upgraded.getSecurityEmergencyMode.staticCall()).to.eq(false);  // ← staticCall!
      await upgraded.setSecurityEmergencyMode(true);
      expect(await upgraded.getSecurityEmergencyMode.staticCall()).to.eq(true);  // ← staticCall!
    });

    it('new security storage fields work alongside old data', async () => {
      // Deploy and upgrade
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();


      const newPluginImpl = await upgradePluginsTo('MockUpgradedPluginWithNewSecurity', withImpl(implementations, { security: await upgradedSecurityImpl.getAddress() }));

      const upgraded = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin.getAddress());

      // OLD storage preserved
      expect(await upgraded.getSecurityRegistry()).to.eq(await securityRegistry.getAddress());

      // NEW storage initialized to defaults - use staticCall and parse result
      const statsResult = await upgraded.getSecurityCheckStats.staticCall();  // ← staticCall!
      expect(statsResult.checkCount).to.eq(0);      // Access as named property
      expect(statsResult.lastCheckTimestamp).to.eq(0);

      // Do a swap to trigger security check
      await mockPool.swapToTick(10);

      // NEW storage updated
      const statsAfter = await upgraded.getSecurityCheckStats.staticCall();  // ← staticCall!
      expect(statsAfter.checkCount).to.eq(1);
      expect(statsAfter.lastCheckTimestamp).to.be.gt(0);

      // OLD storage still intact
      expect(await upgraded.getSecurityRegistry()).to.eq(await securityRegistry.getAddress());
    });

    it('upgrade affects ALL pools simultaneously', async () => {
      // Deploy and upgrade
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();


      // Single upgrade call
      const newPluginImpl = await upgradePluginsTo('MockUpgradedPluginWithNewSecurity', withImpl(implementations, { security: await upgradedSecurityImpl.getAddress() }));

      // BOTH plugins upgraded
      const upgraded1 = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin.getAddress());
      const upgraded2 = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin2.getAddress());

      expect(await upgraded1.hasUpgradedSecurityImpl.staticCall()).to.eq(true);  // ← staticCall!
      expect(await upgraded2.hasUpgradedSecurityImpl.staticCall()).to.eq(true);  // ← staticCall!

      // Both can use emergency mode independently
      await upgraded1.setSecurityEmergencyMode(true);
      expect(await upgraded1.getSecurityEmergencyMode.staticCall()).to.eq(true);  // ← staticCall!
      expect(await upgraded2.getSecurityEmergencyMode.staticCall()).to.eq(false);  // ← staticCall!
    });

    it('emergency mode blocks operations after upgrade', async () => {
      // Deploy and upgrade
      const UpgradedSecurityImplFactory = await ethers.getContractFactory('MockUpgradedSecurityPluginImplementation');
      upgradedSecurityImpl = await UpgradedSecurityImplFactory.deploy();


      const newPluginImpl = await upgradePluginsTo('MockUpgradedPluginWithNewSecurity', withImpl(implementations, { security: await upgradedSecurityImpl.getAddress() }));

      const upgraded = await ethers.getContractAt('MockUpgradedPluginWithNewSecurity', await plugin.getAddress());

      // Operations work normally
      await expect(mockPool.swapToTick(10)).to.not.be.reverted;

      // Enable emergency mode
      await upgraded.setSecurityEmergencyMode(true);

      // Operations blocked
      await expect(mockPool.swapToTick(-10)).to.be.revertedWithCustomError(upgraded, 'PoolDisabled');
      await expect(mockPool.mint(wallet.address, wallet.address, -120, 120, 1000, '0x'))
        .to.be.revertedWithCustomError(upgraded, 'PoolDisabled');

      // Disable emergency mode
      await upgraded.setSecurityEmergencyMode(false);

      // Operations work again
      await expect(mockPool.swapToTick(20)).to.not.be.reverted;
    });
  });

  // ========== VOLATILITY ORACLE STORAGE PRESERVATION ==========

  describe('#Volatility Oracle Storage Preservation on Upgrade', () => {
    let mockPool: any;
    let plugin: MockTimeAlgebraUpgradeablePlugin;

    beforeEach('setup pool with oracle data', async () => {
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();

      await mockPluginFactory.connect(algebraFactorySigner).beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;

      // Connect plugin to pool
      await mockPool.setPlugin(pluginAddress);

      // Initialize pool (creates first timepoint)
      const initialPrice = BigInt('79228162514264337593543950336');
      await mockPool.initialize(initialPrice);
    });

    it('timepointIndex is preserved after upgrade', async () => {
      // Advance time and do swaps to write timepoints
      await plugin.advanceTime(100);
      await mockPool.swapToTick(50);
      
      await plugin.advanceTime(100);
      await mockPool.swapToTick(-50);

      await plugin.advanceTime(100);
      await mockPool.swapToTick(100);

      // Read oracle state BEFORE upgrade
      const timepointIndexBefore = await plugin.timepointIndex();
      expect(timepointIndexBefore).to.be.gt(0); // Should have written several timepoints

      // Upgrade plugin

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Read oracle state AFTER upgrade
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const timepointIndexAfter = await upgradedPlugin.timepointIndex();

      // Verify preserved
      expect(timepointIndexAfter).to.eq(timepointIndexBefore);
    });

    it('lastTimepointTimestamp is preserved after upgrade', async () => {
      // Write some timepoints
      await plugin.advanceTime(500);
      await mockPool.swapToTick(100);

      const lastTimestampBefore = await plugin.lastTimepointTimestamp();
      expect(lastTimestampBefore).to.be.gt(0);

      // Upgrade

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const lastTimestampAfter = await upgradedPlugin.lastTimepointTimestamp();

      expect(lastTimestampAfter).to.eq(lastTimestampBefore);
    });

    it('timepoints array data is preserved after upgrade', async () => {
      // Create multiple timepoints with different ticks
      const swaps = [
        { time: 100, tick: 50 },
        { time: 200, tick: -100 },
        { time: 300, tick: 200 },
        { time: 400, tick: -50 },
      ];

      for (const swap of swaps) {
        await plugin.advanceTime(swap.time);
        await mockPool.swapToTick(swap.tick);
      }

      // Read timepoint data BEFORE upgrade
      const indexBefore = await plugin.timepointIndex();
      
      // Read specific timepoints
      const timepoint0Before = await plugin.timepoints(0);
      const timepointLastBefore = await plugin.timepoints(indexBefore);

      // Upgrade

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      // Read timepoint data AFTER upgrade
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      
      const timepoint0After = await upgradedPlugin.timepoints(0);
      const timepointLastAfter = await upgradedPlugin.timepoints(indexBefore);

      // Verify timepoints preserved
      expect(timepoint0After.initialized).to.eq(timepoint0Before.initialized);
      expect(timepoint0After.blockTimestamp).to.eq(timepoint0Before.blockTimestamp);
      expect(timepoint0After.tickCumulative).to.eq(timepoint0Before.tickCumulative);

      expect(timepointLastAfter.initialized).to.eq(timepointLastBefore.initialized);
      expect(timepointLastAfter.blockTimestamp).to.eq(timepointLastBefore.blockTimestamp);
      expect(timepointLastAfter.tick).to.eq(timepointLastBefore.tick);
    });

    it('oracle still works after upgrade (can write new timepoints)', async () => {
      // Create some timepoints
      await plugin.advanceTime(100);
      await mockPool.swapToTick(50);

      const indexBefore = await plugin.timepointIndex();

      // Upgrade

      const newImpl = await upgradePluginsTo('MockTimeUpgradedPlugin');

      // Use upgraded plugin to write NEW timepoints
      const upgradedPlugin = await ethers.getContractAt('MockTimeUpgradedPlugin', await plugin.getAddress()) as any;
      
      // Advance time and swap (triggers _writeTimepoint in beforeSwap)
      await upgradedPlugin.advanceTime(200);
      await mockPool.swapToTick(-100);

      const indexAfter = await upgradedPlugin.timepointIndex();

      // New timepoint was written
      expect(indexAfter).to.be.gt(indexBefore);
    });

    it('volatility calculation uses preserved historical data after upgrade', async () => {
      // Build up oracle history
      for (let i = 0; i < 10; i++) {
        await plugin.advanceTime(3600);
        await mockPool.swapToTick(i % 2 === 0 ? 100 : -100);
      }

      const timepointIndexBefore = await plugin.timepointIndex();
      expect(timepointIndexBefore).to.be.gt(0);

      // Upgrade

      const newImpl = await upgradePluginsTo('MockUpgradedPlugin');

      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());

      // The history the fee is computed from survived
      expect(await upgradedPlugin.timepointIndex()).to.eq(timepointIndexBefore);

      // The fee value itself may differ, MockUpgradedPlugin reads block.timestamp where
      // MockTimeAlgebraUpgradeablePlugin read its own clock. The AdaptiveFee bounds still hold.
      const feeConfig = await upgradedPlugin.feeConfig.staticCall();
      const fee = await upgradedPlugin.getCurrentFee();
      expect(fee).to.be.gte(feeConfig.baseFee);
      expect(fee).to.be.lte(feeConfig.baseFee + feeConfig.alpha1 + feeConfig.alpha2);
    });

    it('TWAP calculation works with preserved timepoints after upgrade', async () => {
      // Build oracle history for TWAP
      await plugin.advanceTime(1000);
      await mockPool.swapToTick(100);
      
      await plugin.advanceTime(1000);
      await mockPool.swapToTick(150);

      await plugin.advanceTime(1000);
      await mockPool.swapToTick(120);

      // Upgrade

      const newImpl = await upgradePluginsTo('MockTimeUpgradedPlugin');

     
      const upgradedPlugin = await ethers.getContractAt('MockTimeUpgradedPlugin', await plugin.getAddress()) as any;
      await upgradedPlugin.advanceTime(100);
      
      // Should not revert - TWAP calculation uses preserved timepoints
      await expect(mockPool.swapToTick(80)).to.not.be.reverted;
    });
  });

});
