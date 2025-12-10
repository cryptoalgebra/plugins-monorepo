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
  

    describe('NewMockTimePluginFactory - Security Module', () => {
    
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
      await mockPluginFactory.beforeCreatePoolHook(
        await mockPool.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x'
      );
      const pluginAddress = await mockPluginFactory.pluginByPool(mockPool.getAddress());
      plugin = await ethers.getContractAt('MockTimeAlgebraUpgradeablePlugin', pluginAddress) as any;

      await mockPluginFactory.beforeCreatePoolHook(
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        await upgradedSecurityImpl.getAddress()  // NEW security impl!
      );

      // Upgrade all plugins via beacon
      await mockPluginFactory.upgradePlugins(await newPluginImpl.getAddress());

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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        await upgradedSecurityImpl.getAddress()
      );

      await mockPluginFactory.upgradePlugins(await newPluginImpl.getAddress());

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

      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        await upgradedSecurityImpl.getAddress()
      );

      await mockPluginFactory.upgradePlugins(await newPluginImpl.getAddress());

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

      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        await upgradedSecurityImpl.getAddress()
      );

      // Single upgrade call
      await mockPluginFactory.upgradePlugins(await newPluginImpl.getAddress());

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

      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const NewPluginFactory = await ethers.getContractFactory('MockUpgradedPluginWithNewSecurity');
      const newPluginImpl = await NewPluginFactory.deploy(
        mockFactoryAddress,
        factoryAddress,
        implementations.volatilityOracleImpl,
        implementations.dynamicFeeImpl,
        implementations.farmingProxyImpl,
        implementations.almImpl,
        await upgradedSecurityImpl.getAddress()
      );

      await mockPluginFactory.upgradePlugins(await newPluginImpl.getAddress());

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


});
});
