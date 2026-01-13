import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { Wallet, ZeroAddress } from 'ethers';
import { SecurityRegistry, MockFactory } from '../typechain';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('SecurityPlugin', () => {
  let wallet: Wallet, other: Wallet;
  let plugin: any;
  let pool: any;
  let registry: SecurityRegistry;
  let mockFactory: MockFactory

  async function safetySwitchFixture() {
    const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

    const registryFactory = await ethers.getContractFactory('SecurityRegistry');
    const registry = (await registryFactory.deploy(mockFactory)) as any as SecurityRegistry;

    const MockPool = await ethers.getContractFactory('MockPool');
    const pool = await MockPool.deploy();

    const SecurityPluginImplementation = await ethers.getContractFactory('SecurityPluginImplementation');
    const securityImpl = await SecurityPluginImplementation.deploy();

    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    const UpgradeableSecurityPluginTest = await ethers.getContractFactory('UpgradeableSecurityPluginTest');
    const pluginImplementation = await UpgradeableSecurityPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      securityImpl.target
    );

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [pool.target, registry.target]);
    await proxyDeployer.deploy(beacon.target, pool.target, initData);
    const proxyAddress = await proxyDeployer.lastDeployedProxy();

    const plugin = UpgradeableSecurityPluginTest.attach(proxyAddress) as any;

    await pool.setPlugin(proxyAddress);
    // Trigger beforeInitialize to set pluginConfig in the pool
    await pool.initialize(79228162514264337593543950336n);

    return { plugin, pool, registry, mockFactory };
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy safetySwitchTest', async () => {
    ({plugin, pool, registry, mockFactory} = await loadFixture(safetySwitchFixture))
  });

  describe('#SecurityPlugin', () => {
    describe('ENABLE status', async () => {
      it('works correct', async () => {
        await expect(pool.swapToTick(0)).to.not.be.reverted;
        await expect(pool.mint(ZeroAddress, wallet.address, -60, 60, 1, '0x')).to.not.be.reverted;
        await expect(pool.burn(-60, 60, 1, '0x')).to.not.be.reverted;
      });
    });

    describe('BURN_ONLY status', async () => {
      it('works correct', async () => {
        await registry.setGlobalStatus(1)
        await expect(pool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'BurnOnly');
        await expect(pool.mint(ZeroAddress, wallet.address, -60, 60, 1, '0x')).to.be.revertedWithCustomError(plugin, 'BurnOnly');
        await expect(pool.burn(-60, 60, 1, '0x')).to.not.be.reverted;
      });
    });

    describe('DISABLED status', async () => {
      it('works correct', async () => {
        await registry.setGlobalStatus(2)
        await expect(pool.swapToTick(0)).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
        await expect(pool.burn(-60, 60, 1, '0x')).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
        await expect(pool.mint(ZeroAddress, wallet.address, -60, 60, 1, '0x')).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
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