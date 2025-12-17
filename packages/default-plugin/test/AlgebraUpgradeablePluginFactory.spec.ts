import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import { ZERO_ADDRESS, pluginFactoryFixture } from './shared/fixtures';

import { MockFactory } from '../typechain';

describe('AlgebraUpgradeablePluginFactory', () => {
  let wallet: Wallet, other: Wallet;

  let pluginFactory: any;
  let pluginFactoryImpl: any;
  let proxyAdmin: any;
  let proxyAdminOwner: any;
  let mockAlgebraFactory: MockFactory;

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test pluginFactory', async () => {
    ({ pluginFactory, pluginFactoryImpl, proxyAdmin, proxyAdminOwner, mockFactory: mockAlgebraFactory } = await loadFixture(pluginFactoryFixture));
  });

  describe('#Transparent Proxy', () => {
    it('is deployed as proxy', async () => {
      const factoryAddress = await pluginFactory.getAddress();
      const implAddress = await pluginFactoryImpl.getAddress();
      expect(factoryAddress).to.not.eq(implAddress);
    });

    it('has correct algebraFactory', async () => {
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      expect(await pluginFactory.algebraFactory()).to.eq(mockFactoryAddress);
    });

    it('has beacon address', async () => {
      const beacon = await pluginFactory.beacon();
      expect(beacon).to.not.eq(ZERO_ADDRESS);
    });

    it('implementation cannot be initialized directly', async () => {
      await expect(
        pluginFactoryImpl.initialize(
          await (mockAlgebraFactory as any).getAddress(),
          ZERO_ADDRESS,
          { alpha1: 1, alpha2: 1, beta1: 1, beta2: 1, gamma1: 1, gamma2: 1, baseFee: 100 }
        )
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('has ProxyAdmin deployed', async () => {
      const proxyAdminAddress = await proxyAdmin.getAddress();
      expect(proxyAdminAddress).to.not.eq(ZERO_ADDRESS);
    });
  });

  describe('#Factory Upgrade via ProxyAdmin', () => {
    it('only ProxyAdmin owner can upgrade factory', async () => {
      // Deploy a new factory implementation
      const newFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      const proxyAddress = await pluginFactory.getAddress();

      // Other user (not proxyAdminOwner) cannot upgrade via ProxyAdmin
      await expect(
        proxyAdmin.connect(other).upgrade(proxyAddress, await newFactoryImpl.getAddress())
      ).to.be.reverted;
    });

    it('ProxyAdmin owner can upgrade factory', async () => {
      // Deploy a new factory implementation
      const newFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      const proxyAddress = await pluginFactory.getAddress();

      // Upgrade should succeed for ProxyAdmin owner (use upgrade, not upgradeAndCall)
      await proxyAdmin.connect(proxyAdminOwner).upgrade(proxyAddress, await newFactoryImpl.getAddress());

      // Verify factory still works after upgrade
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      expect(await pluginFactory.algebraFactory()).to.eq(mockFactoryAddress);
    });

    it('preserves storage after upgrade', async () => {
      const configuration = {
        alpha1: 3002,
        alpha2: 10009,
        beta1: 1001,
        beta2: 1006,
        gamma1: 20,
        gamma2: 22,
        baseFee: 150,
      };

      // Set some configuration before upgrade
      await pluginFactory.setDefaultFeeConfiguration(configuration);
      await pluginFactory.setFarmingAddress(other.address);

      // Deploy a new factory implementation
      const newFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
      const newFactoryImpl = await newFactoryImplFactory.deploy();

      const proxyAddress = await pluginFactory.getAddress();

      // Upgrade via ProxyAdmin (use upgrade, not upgradeAndCall)
      await proxyAdmin.connect(proxyAdminOwner).upgrade(proxyAddress, await newFactoryImpl.getAddress());

      // Verify storage is preserved
      const newConfig = await pluginFactory.defaultFeeConfiguration();
      expect(newConfig.baseFee).to.eq(configuration.baseFee);
      expect(await pluginFactory.farmingAddress()).to.eq(other.address);
    });
  });

  describe('#Create plugin', () => {
    it('only factory can call beforeCreatePoolHook', async () => {
      await expect(
        pluginFactory.beforeCreatePoolHook(wallet.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')
      ).to.be.revertedWithCustomError(pluginFactory, 'OnlyAlgebraFactory');
    });
  });

  describe('#CreatePluginForExistingPool', () => {
    it('only if has role', async () => {
      await expect(pluginFactory.connect(other).createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWithCustomError(
        pluginFactory,
        'OnlyPoolsAdministrator'
      );
    });

    it('cannot create for nonexistent pool', async () => {
      await expect(pluginFactory.createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWithCustomError(
        pluginFactory,
        'PoolNotExist'
      );
    });

    it('can create for existing pool', async () => {
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);

      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);
      const pluginAddress = await pluginFactory.pluginByPool(other.address);
      expect(pluginAddress).to.not.be.eq(ZERO_ADDRESS);
      
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', pluginAddress);
      const feeConfig = await plugin.feeConfig();
      expect(feeConfig.baseFee).to.be.not.eq(0);
    });

    it('cannot create twice for existing pool', async () => {
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);

      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);

      await expect(pluginFactory.createPluginForExistingPool(wallet.address, other.address)).to.be.revertedWithCustomError(
        pluginFactory,
        'PluginAlreadyCreated'
      );
    });
  });

  describe('#Default fee configuration', () => {
    describe('#setDefaultFeeConfiguration', () => {
      const configuration = {
        alpha1: 3002,
        alpha2: 10009,
        beta1: 1001,
        beta2: 1006,
        gamma1: 20,
        gamma2: 22,
        baseFee: 150,
      };
      it('fails if caller is not owner', async () => {
        await expect(pluginFactory.connect(other).setDefaultFeeConfiguration(configuration)).to.be.revertedWithCustomError(
          pluginFactory,
          'OnlyAdministrator'
        );
      });

      it('updates defaultFeeConfiguration', async () => {
        await pluginFactory.setDefaultFeeConfiguration(configuration);

        const newConfig = await pluginFactory.defaultFeeConfiguration();

        expect(newConfig.alpha1).to.eq(configuration.alpha1);
        expect(newConfig.alpha2).to.eq(configuration.alpha2);
        expect(newConfig.beta1).to.eq(configuration.beta1);
        expect(newConfig.beta2).to.eq(configuration.beta2);
        expect(newConfig.gamma1).to.eq(configuration.gamma1);
        expect(newConfig.gamma2).to.eq(configuration.gamma2);
        expect(newConfig.baseFee).to.eq(configuration.baseFee);
      });

      it('emits event', async () => {
        await expect(pluginFactory.setDefaultFeeConfiguration(configuration))
          .to.emit(pluginFactory, 'DefaultFeeConfiguration')
          .withArgs([
            configuration.alpha1,
            configuration.alpha2,
            configuration.beta1,
            configuration.beta2,
            configuration.gamma1,
            configuration.gamma2,
            configuration.baseFee,
          ]);
      });

      it('cannot exceed max fee', async () => {
        const conf2 = { ...configuration };
        conf2.alpha1 = 30000;
        conf2.alpha2 = 30000;
        conf2.baseFee = 15000;
        await expect(pluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Max fee exceeded');
      });

      it('cannot set zero gamma', async () => {
        let conf2 = { ...configuration };
        conf2.gamma1 = 0;
        await expect(pluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');

        conf2 = { ...configuration };
        conf2.gamma2 = 0;
        await expect(pluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');

        conf2 = { ...configuration };
        conf2.gamma1 = 0;
        conf2.gamma2 = 0;
        await expect(pluginFactory.setDefaultFeeConfiguration(conf2)).to.be.revertedWith('Gammas must be > 0');
      });
    });
  });

  describe('#setFarmingAddress', () => {
    it('fails if caller is not owner', async () => {
      await expect(pluginFactory.connect(other).setFarmingAddress(wallet.address)).to.be.revertedWithCustomError(
        pluginFactory,
        'OnlyAdministrator'
      );
    });

    it('updates farmingAddress', async () => {
      await pluginFactory.setFarmingAddress(other.address);
      expect(await pluginFactory.farmingAddress()).to.eq(other.address);
    });

    it('emits event', async () => {
      await expect(pluginFactory.setFarmingAddress(other.address)).to.emit(pluginFactory, 'FarmingAddress').withArgs(other.address);
    });

    it('cannot set current address', async () => {
      await pluginFactory.setFarmingAddress(other.address);
      await expect(pluginFactory.setFarmingAddress(other.address)).to.be.revertedWithCustomError(
        pluginFactory,
        'FarmingAddressUnchanged'
      );
    });
  });

  describe('#Plugin Upgrade functionality', () => {
    it('has beacon address', async () => {
      const beacon = await pluginFactory.beacon();
      expect(beacon).to.not.eq(ZERO_ADDRESS);
    });

    it('has implementation address', async () => {
      const impl = await pluginFactory.implementation();
      expect(impl).to.not.eq(ZERO_ADDRESS);
    });

    it('only administrator can upgrade plugins', async () => {
      const newImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
      const mockFactoryAddress = await (mockAlgebraFactory as any).getAddress();
      const pluginFactoryAddress = await pluginFactory.getAddress();
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS
      );

      await expect(pluginFactory.connect(other).upgradePlugins(newImpl)).to.be.revertedWithCustomError(
        pluginFactory,
        'OnlyAdministrator'
      );
    });

    it('administrator can upgrade plugins successfully', async () => {
      // Create plugin first
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);
      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);
      
      const implBefore = await pluginFactory.implementation();

      // Deploy new implementation
      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const mockFactoryAddress = await mockAlgebraFactory.getAddress();
      const pluginFactoryAddress = await pluginFactory.getAddress();
      const newImpl = await newImplFactory.deploy(
        mockFactoryAddress,
        pluginFactoryAddress,
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS
      );

      // Should succeed (wallet is owner)
      await pluginFactory.upgradePlugins(await newImpl.getAddress());

      const implAfter = await pluginFactory.implementation();
      expect(implAfter).to.eq(await newImpl.getAddress());
      expect(implAfter).to.not.eq(implBefore);
    });

    it('upgrade affects existing plugins', async () => {
      await mockAlgebraFactory.stubPool(wallet.address, other.address, other.address);
      await pluginFactory.createPluginForExistingPool(wallet.address, other.address);
      const pluginAddress = await pluginFactory.pluginByPool(other.address);

      const newImplFactory = await ethers.getContractFactory('MockUpgradedPlugin');
      const newImpl = await newImplFactory.deploy(
        await mockAlgebraFactory.getAddress(),
        await pluginFactory.getAddress(),
        ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS
      );

      await pluginFactory.upgradePlugins(await newImpl.getAddress());

      const upgradedPlugin = await ethers.getContractAt('MockUpgradedPlugin', pluginAddress);
      expect(await upgradedPlugin.isUpgraded()).to.eq(true);
    });
  });

  describe('#setSecurityRegistry', () => {
    it('fails if caller is not administrator', async () => {
      await expect(
        pluginFactory.connect(other).setSecurityRegistry(wallet.address)
      ).to.be.revertedWithCustomError(pluginFactory, 'OnlyAdministrator');
    });

    it('updates securityRegistry', async () => {
      await pluginFactory.setSecurityRegistry(other.address);
      expect(await pluginFactory.securityRegistry()).to.eq(other.address);
    });
  });

  describe('#setDefaultRebalanceManager', () => {
    it('fails if caller is not administrator', async () => {
      await expect(
        pluginFactory.connect(other).setDefaultRebalanceManager(wallet.address)
      ).to.be.revertedWithCustomError(pluginFactory, 'OnlyAdministrator');
    });

    it('updates defaultRebalanceManager', async () => {
      await pluginFactory.setDefaultRebalanceManager(other.address);
      expect(await pluginFactory.defaultRebalanceManager()).to.eq(other.address);
    });
  });

  describe('#setDefaultAlmTwapPeriods', () => {
    it('fails if caller is not administrator', async () => {
      await expect(
        pluginFactory.connect(other).setDefaultAlmTwapPeriods(3600, 600)
      ).to.be.revertedWithCustomError(pluginFactory, 'OnlyAdministrator');
    });

    it('updates TWAP periods', async () => {
      await pluginFactory.setDefaultAlmTwapPeriods(7200, 1200);
      expect(await pluginFactory.defaultSlowTwapPeriod()).to.eq(7200);
      expect(await pluginFactory.defaultFastTwapPeriod()).to.eq(1200);
    });

    it('reverts if slowPeriod < fastPeriod', async () => {
      await expect(
        pluginFactory.setDefaultAlmTwapPeriods(600, 3600)
      ).to.be.revertedWithCustomError(pluginFactory, 'InvalidAlmTwapPeriods');
    });
  });
});
