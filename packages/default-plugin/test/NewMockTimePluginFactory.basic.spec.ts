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

  // ========== PROXY PATTERN ==========

  describe('#Transparent Proxy Pattern', () => {
    it('is deployed as proxy', async () => {
      const factoryAddress = await mockPluginFactory.getAddress();
      const implAddress = await factoryImpl.getAddress();
      expect(factoryAddress).to.not.eq(implAddress);
    });

    it('has correct algebraFactory', async () => {
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      expect(await mockPluginFactory.algebraFactory()).to.eq(mockFactoryAddress);
    });

    it('has beacon address', async () => {
      const beacon = await mockPluginFactory.beacon();
      expect(beacon).to.not.eq(ZERO_ADDRESS);
    });

    it('implementation cannot be initialized directly', async () => {
      await expect(
        factoryImpl.initialize(
          await (mockAlgebraFactory as any).getAddress(),
          ZERO_ADDRESS,
          DEFAULT_FEE_CONFIGURATION
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  // ========== FACTORY UPGRADE ==========

  describe('#Factory Upgrade via ProxyAdmin', () => {
    it('ProxyAdmin owner can upgrade factory', async () => {
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      const proxyAddress = await mockPluginFactory.getAddress();
      await proxyAdmin.connect(proxyAdminOwner).upgrade(proxyAddress, await newFactoryImpl.getAddress());

      // Verify factory still works
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      expect(await mockPluginFactory.algebraFactory()).to.eq(mockFactoryAddress);
    });

    it('preserves storage after factory upgrade', async () => {
      // Set configurations before upgrade
      await mockPluginFactory.setFarmingAddress(other.address);
      await mockPluginFactory.setSecurityRegistry(other.address);
      await mockPluginFactory.setDefaultRebalanceManager(almManager.address);
      await mockPluginFactory.setDefaultAlmTwapPeriods(3600, 600);

      // Upgrade factory
      const newFactoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
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
      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      expect(pluginAddress).to.not.eq(ZERO_ADDRESS);
    });

    it('plugin has correct fee configuration', async () => {
      await mockPluginFactory.beforeCreatePoolHook(
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
      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      await expect(
        mockPluginFactory.beforeCreatePoolHook(
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
      await mockPluginFactory.beforeCreatePoolHook(
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

      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(), 
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );

      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;
    });

    it('has implementation address', async () => {
      const impl = await mockPluginFactory.implementation();
      expect(impl).to.not.eq(ZERO_ADDRESS);
    });

    it('can upgrade plugins', async () => {
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      // Deploy MockUpgradedPlugin
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

      // Upgrade
      await mockPluginFactory.upgradePlugins(await newImpl.getAddress());

      // Verify upgrade
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      expect(await upgradedPlugin.isUpgraded()).to.eq(true);
    });

    it('preserves storage after plugin upgrade', async () => {
      // Store some data
      const feeConfigBefore = await plugin.feeConfig.staticCall();
      const poolBefore = await plugin.pool();

      // Deploy and upgrade to MockUpgradedPlugin
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

      // Verify storage preserved
      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      const feeConfigAfter = await upgradedPlugin.feeConfig.staticCall();
      
      expect(feeConfigAfter.alpha1).to.eq(feeConfigBefore.alpha1);
      expect(feeConfigAfter.baseFee).to.eq(feeConfigBefore.baseFee);
      expect(await upgradedPlugin.pool()).to.eq(poolBefore);
    });
  });


  
});
