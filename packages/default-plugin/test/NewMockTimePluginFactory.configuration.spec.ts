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

describe('NewMockTimePluginFactory - Configuration', () => {
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
// ========== ALM SETTERS ==========

describe('#ALM Configuration', () => {
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
    });
  });

  // ========== SECURITY SETTERS ==========

  describe('#Security Configuration', () => {
    describe('#setSecurityRegistry', () => {
      it('updates securityRegistry', async () => {
        await mockPluginFactory.setSecurityRegistry(other.address);
        expect(await mockPluginFactory.securityRegistry()).to.eq(other.address);
      });

      it('emits SecurityRegistry event', async () => {
        await expect(mockPluginFactory.setSecurityRegistry(other.address))
          .to.emit(mockPluginFactory, 'SecurityRegistry')
          .withArgs(other.address);
      });
    });
  });

  // ========== FEE CONFIGURATION ==========

  describe('#Fee Configuration', () => {
    const newConfig = {
      alpha1: 3002,
      alpha2: 10009,
      beta1: 1001,
      beta2: 1006,
      gamma1: 20,
      gamma2: 22,
      baseFee: 150,
    };

    it('updates defaultFeeConfiguration', async () => {
      await mockPluginFactory.setDefaultFeeConfiguration(newConfig);
      const config = await mockPluginFactory.defaultFeeConfiguration();
      expect(config.alpha1).to.eq(newConfig.alpha1);
      expect(config.baseFee).to.eq(newConfig.baseFee);
    });

    it('emits DefaultFeeConfiguration event', async () => {
      await expect(mockPluginFactory.setDefaultFeeConfiguration(newConfig))
        .to.emit(mockPluginFactory, 'DefaultFeeConfiguration');
    });
  });

  // ========== FARMING CONFIGURATION ==========

  describe('#Farming Configuration', () => {
    describe('#setFarmingAddress', () => {
      it('updates farmingAddress', async () => {
        await mockPluginFactory.setFarmingAddress(other.address);
        expect(await mockPluginFactory.farmingAddress()).to.eq(other.address);
      });

      it('emits FarmingAddress event', async () => {
        await expect(mockPluginFactory.setFarmingAddress(other.address))
          .to.emit(mockPluginFactory, 'FarmingAddress')
          .withArgs(other.address);
      });

      it('cannot set same address twice', async () => {
        await mockPluginFactory.setFarmingAddress(other.address);
        await expect(mockPluginFactory.setFarmingAddress(other.address)).to.be.reverted;
      });
    });
  });

  
});
