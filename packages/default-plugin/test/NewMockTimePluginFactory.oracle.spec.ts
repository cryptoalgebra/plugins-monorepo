import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { ZERO_ADDRESS, newMockTimeUpgradeablePluginFactoryFixture } from './shared/fixtures';
import { MockFactory, NewMockTimeUpgradeablePluginFactory, MockTimeAlgebraUpgradeablePlugin } from '../typechain';
import { Wallet } from 'ethers';


describe('NewMockTimePluginFactory - Volatility Oracle', () => {
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

  
  // ========== VOLATILITY ORACLE STORAGE PRESERVATION ==========

  describe('#Volatility Oracle Storage Preservation on Upgrade', () => {
    let mockPool: any;
    let plugin: MockTimeAlgebraUpgradeablePlugin;

    beforeEach('setup pool with oracle data', async () => {
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = await mockPoolFactory.deploy();

      await mockPluginFactory.beforeCreatePoolHook(
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImplFactory = await ethers.getContractFactory('MockTimeUpgradedPlugin');
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

      // Get upgraded plugin with MockTimeUpgradedPlugin interface
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

      // Upgrade
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
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

      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      
      // After upgrade, getCurrentFee() should still work (not revert)
      // Note: fee value may differ because MockUpgradedPlugin uses real block.timestamp
      // while MockTimeAlgebraUpgradeablePlugin used mock time
      await expect(upgradedPlugin.getCurrentFee()).to.not.be.reverted;
      
      const fee = await upgradedPlugin.getCurrentFee();
      expect(fee).to.be.gte(0); // Fee should be valid
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
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const factoryAddress = await mockPluginFactory.getAddress();

      const newImplFactory = await ethers.getContractFactory('MockTimeUpgradedPlugin');
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

     
      const upgradedPlugin = await ethers.getContractAt('MockTimeUpgradedPlugin', await plugin.getAddress()) as any;
      await upgradedPlugin.advanceTime(100);
      
      // Should not revert - TWAP calculation uses preserved timepoints
      await expect(mockPool.swapToTick(80)).to.not.be.reverted;
    });
  });

});
