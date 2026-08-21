import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool } from 'test-utils/beaconPlugin';

describe('UpgradeableLimitOrderPlugin', function () {
  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableLimitOrderPluginTest',
      setup: async ({ mockPool }) => {
        const mockLimitOrderManager = await (await ethers.getContractFactory('MockLimitOrderManager')).deploy();
        const limitOrderImpl = await (await ethers.getContractFactory('LimitOrderPluginImplementation')).deploy();

        return {
          pluginArgs: [limitOrderImpl.target],
          initArgs: [mockPool.target, mockLimitOrderManager.target],
          extra: { mockLimitOrderManager, limitOrderImpl }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, mockLimitOrderManager } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager.target);
    });

    it('should have Limit Order Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Limit Order Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, mockLimitOrderManager } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, mockLimitOrderManager.target)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // AFTER_SWAP_FLAG = 1 << 1 = 2
      const AFTER_SWAP_FLAG = 2n;
      const config = await plugin1.defaultPluginConfig();
      expect(config & AFTER_SWAP_FLAG).to.equal(AFTER_SWAP_FLAG);
    });
  });

  describe('LimitOrderManager', function () {
    it('should allow manager to set limitOrderManager', async function () {
      const { plugin1, manager, otherUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setLimitOrderManager(otherUser.address))
        .to.emit(plugin1, 'LimitOrderManager')
        .withArgs(otherUser.address);

      expect(await plugin1.limitOrderManager.staticCall()).to.equal(otherUser.address);
    });

    it('should not allow non-manager to set limitOrderManager', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setLimitOrderManager(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should allow setting limitOrderManager to zero address', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setLimitOrderManager(ethers.ZeroAddress);
      expect(await plugin1.limitOrderManager.staticCall()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        deployProxy,
        beacon,
        mockFactory,
        pluginImplementation,
        plugin1,
        mockPool,
        mockLimitOrderManager,
        PluginContract,
        manager,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second MockLimitOrderManager
      const MockLimitOrderManager = await ethers.getContractFactory('MockLimitOrderManager');
      const mockLimitOrderManager2 = await MockLimitOrderManager.deploy();

      // Deploy second proxy
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, mockLimitOrderManager2.target]);

      // Verify different values
      expect(await plugin1.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager.target);
      expect(await plugin2.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        deployProxy,
        beacon,
        mockFactory,
        pluginImplementation,
        plugin1,
        PluginContract,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second proxy
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

      // Owner should be able to set limitOrderManager
      await expect(plugin1.connect(owner).setLimitOrderManager(user.address))
        .to.emit(plugin1, 'LimitOrderManager');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setLimitOrderManager(user.address))
        .to.emit(plugin1, 'LimitOrderManager');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setLimitOrderManager(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
