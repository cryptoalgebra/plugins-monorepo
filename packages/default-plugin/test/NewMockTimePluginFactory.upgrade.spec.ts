import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { 
  ZERO_ADDRESS, 
  DEFAULT_FEE_CONFIGURATION, 
  newMockTimeUpgradeablePluginFactoryFixture 
} from './shared/fixtures';

import { MockFactory, NewMockTimeUpgradeablePluginFactory, MockTimeAlgebraUpgradeablePlugin } from '../typechain';

describe('NewMockTimePluginFactory - Basic', () => {
  let wallet: Wallet, other: Wallet, almManager: Wallet;

  let mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  let factoryImpl: any;
  let proxyAdmin: any;
  let proxyAdminOwner: any;
  let mockAlgebraFactory: MockFactory;
  let implementations: {
    volatilityOracleImpl: string;
    dynamicFeeImpl: string;
    farmingProxyImpl: string;
    almImpl: string;
    securityImpl: string;
  };

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
  });

    describe('NewMockTimePluginFactory - Upgrade Flows', () => {
        
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
      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;

      // Create plugin for pool 2
      await mockPluginFactory.beforeCreatePoolHook(
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
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      // Deploy new implementation
      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        implementations.securityImpl
      );

      // Single upgrade call affects ALL plugins
      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

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
      const alm1Before = await plugin.rebalanceManager();
      const security1Before = await plugin.getSecurityRegistry();
      const activeModules1Before = await plugin.activeModules(0); // First module

      // Deploy and upgrade
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        implementations.securityImpl
      );

      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

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

      // ALM config preserved
      expect(await upgraded1.rebalanceManager()).to.eq(alm1Before);
      expect(await upgraded1.slowTwapPeriod()).to.eq(3600);
      expect(await upgraded1.fastTwapPeriod()).to.eq(600);

      // Security config preserved
      expect(await upgraded1.getSecurityRegistry()).to.eq(security1Before);

      // Active modules preserved
      expect(await upgraded1.activeModules(0)).to.eq(activeModules1Before);
    });

    it('new functions available after plugin upgrade', async () => {
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        implementations.securityImpl
      );

      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

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
      expect(await upgraded.activeModules(0)).to.eq('Volatility Oracle Plugin');

      // OLD: DynamicFee storage (algebra.storage.dynamicfee)
      const feeConfig = await upgraded.feeConfig.staticCall();
      expect(feeConfig.alpha1).to.eq(DEFAULT_FEE_CONFIGURATION.alpha1);
      expect(feeConfig.baseFee).to.eq(DEFAULT_FEE_CONFIGURATION.baseFee);

      // OLD: VolatilityOracle storage (algebra.storage.volatilityoracle)
    
      const timepointIndex = await upgraded.timepointIndex();
      expect(timepointIndex).to.be.gte(0);
      const timepoint0 = await upgraded.timepoints(0);
      expect(timepoint0.initialized).to.eq(true);

      // OLD: ALM storage (algebra.storage.alm)
      expect(await upgraded.rebalanceManager()).to.eq(almManager.address);
      expect(await upgraded.slowTwapPeriod()).to.eq(3600);
      expect(await upgraded.fastTwapPeriod()).to.eq(600);

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
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        implementations.securityImpl
      );

      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

      const upgraded = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());

      // Old functions still work
      const feeConfig = await upgraded.feeConfig.staticCall();
      expect(feeConfig.baseFee).to.not.eq(0);

      expect(await upgraded.pool()).to.eq(await mockPool.getAddress());
      expect(await upgraded.pluginFactory()).to.eq(factoryAddress);
    });

    it('new plugins after upgrade use new implementation', async () => {
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      // Upgrade plugins
      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        implementations.securityImpl
      );

      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

      // Create NEW pool and plugin AFTER upgrade
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const newPool = await mockPoolFactory.deploy();

      await mockPluginFactory.beforeCreatePoolHook(
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

      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
    });

    it('preserves beacon after factory upgrade', async () => {
      const beaconBefore = await mockPluginFactory.beacon();
      const implementationBefore = await mockPluginFactory.implementation();

      // Upgrade factory
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      await proxyAdmin.connect(proxyAdminOwner).upgrade(
        await mockPluginFactory.getAddress(),
        await newFactoryImpl.getAddress()
      );

      // Create NEW pool after factory upgrade
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const newPool = await mockPoolFactory.deploy();

      await mockPluginFactory.beforeCreatePoolHook(
        await newPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const newPluginAddress = await mockPluginFactory.pluginByPool(newPool.getAddress());
      expect(newPluginAddress).to.not.eq(ZERO_ADDRESS);

      // New plugin has correct config (inherited from factory)
      const newPlugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', newPluginAddress);
      expect(await newPlugin.rebalanceManager()).to.eq(almManager.address);
      expect(await newPlugin.getSecurityRegistry()).to.eq(other.address);
    });

    it('can modify configs after factory upgrade', async () => {
      // Upgrade factory
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
  });
});
