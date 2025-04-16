import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { Wallet, ZeroAddress } from 'ethers';
import { SecurityPluginTest, SecurityRegistry, MockFactory } from '../typechain';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('SecurityPlugin', () => {
  let wallet: Wallet, other: Wallet;
  let plugin: SecurityPluginTest;
  let registry: SecurityRegistry;
  let mockFactory: MockFactory

  async function safetySwitchFixture() {

    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

    const registryFactory = await ethers.getContractFactory('SecurityRegistry');
    const registry = (await registryFactory.deploy(mockFactory)) as any as SecurityRegistry; 

    const factory = await ethers.getContractFactory('SecurityPluginTest');
    const plugin = (await factory.deploy(mockFactory, registry)) as any as SecurityPluginTest;

    return {plugin, registry, mockFactory};
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy safetySwitchTest', async () => {
    ({plugin, registry, mockFactory} = await loadFixture(safetySwitchFixture))
  });

  describe('#SecurityPlugin', () => {
    let defaultConfig: bigint;

    beforeEach('initialize pool', async () => {
      defaultConfig = await plugin.defaultPluginConfig();
    });

    describe('ENABLE status', async () => {
      it('works correct', async () => {
        await expect(plugin.swap()).to.not.be.reverted;
        await expect(plugin.mint()).not.to.be.reverted;
        await expect(plugin.burn()).not.to.be.reverted; 
      });
    });

    describe('BURN_ONLY status', async () => {
      it('works correct', async () => {
        await registry.setGlobalStatus(1)
        await expect(plugin.swap()).to.be.revertedWithCustomError(plugin,'BurnOnly'); 
        await expect(plugin.mint()).to.be.revertedWithCustomError(plugin,'BurnOnly'); 
        await expect(plugin.burn()).to.not.be.reverted;
      });
    });

    describe('DISABLED status', async () => {
      it('works correct', async () => {
        await registry.setGlobalStatus(2)
        await expect(plugin.swap()).to.be.revertedWithCustomError(plugin,'PoolDisabled');
        await expect(plugin.burn()).to.be.revertedWithCustomError(plugin,'PoolDisabled');
        await expect(plugin.mint()).to.be.revertedWithCustomError(plugin,'PoolDisabled');
      });
    });
  })

  describe('AlgebaraSecurityPlugin external methods', () => {
     
    it('set registry contract works correct', async () => {
      await mockFactory.grantRole(await plugin.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);
      await plugin.setSecurityRegistry(ZeroAddress);
      await expect(plugin.setSecurityRegistry(registry)).to.emit(plugin, 'SecurityRegistry');
      expect(await plugin.getSecurityRegistry()).to.be.eq(registry);
    });

    it('only owner can set registry address', async () => {
      await expect(plugin.connect(other).setSecurityRegistry(ZeroAddress)).to.be.reverted;
    });

  });

  describe('#SecurtityRegistry', () => {

    describe('#setPoolStatus', async () => {
      it('works correct', async () => {
        await registry.setPoolsStatus([wallet], [1]);
        expect(await registry.poolStatus(wallet)).to.be.eq(1);
        await registry.setPoolsStatus([wallet], [2]);
        expect(await registry.poolStatus(wallet)).to.be.eq(2);
        await registry.setPoolsStatus([wallet], [0]);
        expect(await registry.poolStatus(wallet)).to.be.eq(0);
      });

      it('add few pools updates isPoolStatusOverrided var', async () => {
        await registry.setPoolsStatus([wallet, wallet], [1, 1]);
        expect(await registry.isPoolStatusOverrided()).to.be.eq(true);
        await registry.setPoolsStatus([wallet, wallet], [1, 1]);
        await registry.setPoolsStatus([wallet, wallet], [0, 0]);
        expect(await registry.isPoolStatusOverrided()).to.be.eq(false);
        await registry.setPoolsStatus([wallet, wallet], [1, 1]);
        await registry.setPoolsStatus([wallet, wallet], [0, 1]);
        expect(await registry.isPoolStatusOverrided()).to.be.eq(true);

      });

      it('only owner can set all pool status', async () => {
        await expect(registry.connect(other).setPoolsStatus([wallet], [1])).to.be.reverted
        await mockFactory.grantRole(await registry.GUARD(), other.address);
        await expect(registry.connect(other).setPoolsStatus([wallet], [0])).to.be.reverted
        await expect(registry.connect(other).setPoolsStatus([wallet], [1])).to.be.reverted
      });

      it('address with guard role can set DISABLED pool status', async () => {
        await mockFactory.grantRole(await registry.GUARD(), other.address);
        await expect(registry.connect(other).setPoolsStatus([wallet], [2])).to.emit(registry, 'PoolStatus');
        expect(await registry.poolStatus(wallet)).to.be.eq(2);
      });
    });


    describe('#setGlobalStatus', async () => {
        it('works correct', async () => {
          await registry.setGlobalStatus(1);
          expect(await registry.globalStatus()).to.be.eq(1);
          await registry.setGlobalStatus(2);
          expect(await registry.globalStatus()).to.be.eq(2);
          await registry.setGlobalStatus(0);
          expect(await registry.globalStatus()).to.be.eq(0);
        });

        it('only owner can set all pool status', async () => {
          await expect(registry.connect(other).setGlobalStatus(1)).to.be.reverted
          await mockFactory.grantRole(await registry.GUARD(), other.address);
          await expect(registry.connect(other).setGlobalStatus(1)).to.be.reverted
          await expect(registry.connect(other).setGlobalStatus(0)).to.be.reverted
        });

        it('address with guard role can set DISABLED pool status', async () => {
          await mockFactory.grantRole(await registry.GUARD(), other.address);
          await expect(registry.connect(other).setGlobalStatus(2)).to.emit(registry, 'GlobalStatus');
          expect(await registry.globalStatus()).to.be.eq(2);
        });
    });

    describe('#getPoolStatus', async () => {
      it('pool status overrides global status, if global status is ENABLED ', async () => {
        await registry.setGlobalStatus(0);
        await registry.setPoolsStatus([wallet], [1]);
        expect(await registry.getPoolStatus(wallet)).to.be.eq(1);

        await registry.setGlobalStatus(0);
        await registry.setPoolsStatus([wallet], [2]);
        expect(await registry.getPoolStatus(wallet)).to.be.eq(2);
      });

      it('global status overrides pool status, if global status is BURN_ONLY or DISABLED ', async () => {
        await registry.setGlobalStatus(2);
        await registry.setPoolsStatus([wallet], [1]);
        expect(await registry.getPoolStatus(wallet)).to.be.eq(2);

        await registry.setGlobalStatus(1);
        await registry.setPoolsStatus([wallet], [2]);
        expect(await registry.getPoolStatus(wallet)).to.be.eq(1);
      });

  });
  });

});