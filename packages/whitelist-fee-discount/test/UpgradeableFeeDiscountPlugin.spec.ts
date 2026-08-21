import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool } from 'test-utils/beaconPlugin';

describe('UpgradeableFeeDiscountPlugin', function () {
  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableFeeDiscountPluginTest',
      setup: async ({ mockPool }) => {
        const mockFeeDiscountRegistry = await (await ethers.getContractFactory('MockFeeDiscountRegistry')).deploy();
        const feeDiscountImpl = await (await ethers.getContractFactory('FeeDiscountPluginImplementation')).deploy();

        return {
          pluginArgs: [feeDiscountImpl.target],
          initArgs: [mockPool.target, mockFeeDiscountRegistry.target],
          extra: { mockFeeDiscountRegistry, feeDiscountImpl }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, mockFeeDiscountRegistry } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.feeDiscountRegistry()).to.equal(mockFeeDiscountRegistry.target);
    });

    it('should have Fee Discount Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Fee Discount Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, mockFeeDiscountRegistry } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, mockFeeDiscountRegistry.target)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_SWAP_FLAG = 1
      const BEFORE_SWAP_FLAG = 1n;
      const expectedConfig = BEFORE_SWAP_FLAG;
      
      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(expectedConfig);
    });
  });

  describe('FeeDiscountRegistry', function () {
    it('should allow manager to set feeDiscountRegistry', async function () {
      const { plugin1, manager, otherUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setFeeDiscountRegistry(otherUser.address))
        .to.emit(plugin1, 'FeeDiscountRegistry')
        .withArgs(otherUser.address);

      expect(await plugin1.feeDiscountRegistry()).to.equal(otherUser.address);
    });

    it('should not allow non-manager to set feeDiscountRegistry', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setFeeDiscountRegistry(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should allow setting feeDiscountRegistry to zero address', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setFeeDiscountRegistry(ethers.ZeroAddress);
      expect(await plugin1.feeDiscountRegistry()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        deployProxy,
        beacon,
        pluginImplementation,
        plugin1,
        mockPool,
        mockFeeDiscountRegistry,
        PluginContract,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second MockFeeDiscountRegistry
      const MockFeeDiscountRegistry = await ethers.getContractFactory('MockFeeDiscountRegistry');
      const mockFeeDiscountRegistry2 = await MockFeeDiscountRegistry.deploy();

      // Deploy second proxy
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, mockFeeDiscountRegistry2.target]);

      // Verify different values
      expect(await plugin1.feeDiscountRegistry()).to.equal(mockFeeDiscountRegistry.target);
      expect(await plugin2.feeDiscountRegistry()).to.equal(mockFeeDiscountRegistry2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        deployProxy,
        beacon,
        mockFactory,
        proxyDeployer,
        pluginImplementation,
        plugin1,
        PluginContract,
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

      // Owner should be able to set feeDiscountRegistry
      await expect(plugin1.connect(owner).setFeeDiscountRegistry(user.address))
        .to.emit(plugin1, 'FeeDiscountRegistry');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setFeeDiscountRegistry(user.address))
        .to.emit(plugin1, 'FeeDiscountRegistry');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setFeeDiscountRegistry(otherUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
