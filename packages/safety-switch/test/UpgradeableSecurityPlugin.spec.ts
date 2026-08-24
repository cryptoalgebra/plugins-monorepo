import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool } from 'test-utils/beaconPlugin';

describe('UpgradeableSecurityPlugin', function () {
  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableSecurityPluginTest',
      setup: async ({ mockPool }) => {
        const securityImpl = await (await ethers.getContractFactory('SecurityPluginImplementation')).deploy();
        const mockSecurityRegistry = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();

        return {
          pluginArgs: [securityImpl.target],
          initArgs: [mockPool.target, mockSecurityRegistry.target],
          extra: { securityImpl, mockSecurityRegistry }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, mockSecurityRegistry } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.getSecurityRegistry()).to.equal(mockSecurityRegistry.target);
    });

    it('should have Security Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Security Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, mockSecurityRegistry } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, mockSecurityRegistry.target)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_SWAP_FLAG | BEFORE_FLASH_FLAG | BEFORE_POSITION_MODIFY_FLAG
      // = 1 | 16 | 4 = 21
      const BEFORE_SWAP_FLAG = 1n;
      const BEFORE_POSITION_MODIFY_FLAG = 1n << 2n;
      const BEFORE_FLASH_FLAG = 1n << 4n;
      const expectedConfig = BEFORE_SWAP_FLAG | BEFORE_POSITION_MODIFY_FLAG | BEFORE_FLASH_FLAG;
      
      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(expectedConfig);
    });
  });

  describe('SecurityRegistry', function () {
    it('should allow manager to set securityRegistry', async function () {
      const { plugin1, manager, otherUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setSecurityRegistry(otherUser.address))
        .to.emit(plugin1, 'SecurityRegistry')
        .withArgs(otherUser.address);

      expect(await plugin1.getSecurityRegistry()).to.equal(otherUser.address);
    });

    it('should not allow non-manager to set securityRegistry', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setSecurityRegistry(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should allow setting securityRegistry to zero address', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setSecurityRegistry(ethers.ZeroAddress);
      expect(await plugin1.getSecurityRegistry()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const { plugin1, mockSecurityRegistry, deployProxy } = await loadFixture(deployFixture);

      const mockPool2 = await deployMockPool();
      const mockSecurityRegistry2 = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, mockSecurityRegistry2.target]);

      // Verify different values
      expect(await plugin1.getSecurityRegistry()).to.equal(mockSecurityRegistry.target);
      expect(await plugin2.getSecurityRegistry()).to.equal(mockSecurityRegistry2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const { plugin1, mockFactory, proxyDeployer, deployProxy } = await loadFixture(deployFixture);

      const mockPool2 = await deployMockPool();
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, ethers.ZeroAddress]);

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });
  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner, user } = await loadFixture(deployFixture);

      // Owner should be able to set securityRegistry
      await expect(plugin1.connect(owner).setSecurityRegistry(user.address))
        .to.emit(plugin1, 'SecurityRegistry');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setSecurityRegistry(user.address))
        .to.emit(plugin1, 'SecurityRegistry');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setSecurityRegistry(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });

  // The connector reads the registry straight off storage instead of delegating, so the
  // implementation keeps a second getter no plugin reaches. Its guarded early exits are only
  // reachable there too: a plugin always has a registry by the time the hooks run.
  describe('Implementation kept in step with the connector', function () {
    it('should report the same registry as the connector', async function () {
      const { plugin1, securityImpl, mockSecurityRegistry } = await loadFixture(deployFixture);

      await plugin1.setSecurityRegistry(mockSecurityRegistry.target);
      await securityImpl.initializeSecurity(mockSecurityRegistry.target);

      expect(await securityImpl.getSecurityRegistry()).to.equal(await plugin1.getSecurityRegistry());
    });

    it('should let both checks through while no registry is set', async function () {
      const { securityImpl, mockPool } = await loadFixture(deployFixture);

      expect(await securityImpl.getSecurityRegistry()).to.equal(ethers.ZeroAddress);

      await expect(securityImpl.checkStatus(mockPool.target)).to.not.be.reverted;
      await expect(securityImpl.checkStatusOnBurn(mockPool.target)).to.not.be.reverted;
    });

    it('should enforce the registry once it has one', async function () {
      const { securityImpl, mockPool, mockSecurityRegistry } = await loadFixture(deployFixture);

      await securityImpl.initializeSecurity(mockSecurityRegistry.target);
      await mockSecurityRegistry.setPoolStatus(mockPool.target, 2);

      await expect(securityImpl.checkStatus(mockPool.target)).to.be.revertedWithCustomError(securityImpl, 'PoolDisabled');
      await expect(securityImpl.checkStatusOnBurn(mockPool.target)).to.be.revertedWithCustomError(securityImpl, 'PoolDisabled');
    });
  });
});
