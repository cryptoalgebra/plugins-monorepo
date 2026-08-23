import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool } from 'test-utils/beaconPlugin';

describe('UpgradeableManagedFeePlugin', function () {
  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableManagedFeePluginTest',
      setup: async ({ mockPool }) => {
        const managedFeeImpl = await (await ethers.getContractFactory('ManagedFeePluginImplementation')).deploy();

        return {
          pluginArgs: [managedFeeImpl.target],
          initArgs: [],
          extra: { managedFeeImpl }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
    });

    it('should have Managed Fee Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Managed Fee Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize()
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_SWAP_FLAG = 1 << 0 = 1, DYNAMIC_FEE = 1 << 7 = 128
      const BEFORE_SWAP_FLAG = 1n;
      const DYNAMIC_FEE = 128n;
      const config = await plugin1.defaultPluginConfig();
      expect(config & BEFORE_SWAP_FLAG).to.equal(BEFORE_SWAP_FLAG);
      expect(config & DYNAMIC_FEE).to.equal(DYNAMIC_FEE);
    });
  });

  describe('Whitelist Management', function () {
    it('should allow manager to whitelist address', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setWhitelistStatus(user.address, true))
        .to.emit(plugin1, 'WhitelistedAddress')
        .withArgs(user.address, true);

      expect(await plugin1.whitelistedAddresses(user.address)).to.equal(true);
    });

    it('should allow manager to remove from whitelist', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setWhitelistStatus(user.address, true);
      await expect(plugin1.connect(manager).setWhitelistStatus(user.address, false))
        .to.emit(plugin1, 'WhitelistedAddress')
        .withArgs(user.address, false);

      expect(await plugin1.whitelistedAddresses(user.address)).to.equal(false);
    });

    it('should not allow non-manager to whitelist', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setWhitelistStatus(otherUser.address, true)
      ).to.be.revertedWith('Not authorized');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        deployProxy,
        beacon,
        pluginImplementation,
        plugin1,
        PluginContract,
        manager,
        user,
        otherUser,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second proxy
        const plugin2 = await deployProxy(mockPool2, []);

      // Whitelist user in plugin1 only
      await plugin1.connect(manager).setWhitelistStatus(user.address, true);

      // Check whitelist is isolated
      expect(await plugin1.whitelistedAddresses(user.address)).to.equal(true);
      expect(await plugin2.whitelistedAddresses(user.address)).to.equal(false);
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
      const plugin2 = await deployProxy(mockPool2, []);

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

      await expect(plugin1.connect(owner).setWhitelistStatus(user.address, true))
        .to.emit(plugin1, 'WhitelistedAddress');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setWhitelistStatus(user.address, true))
        .to.emit(plugin1, 'WhitelistedAddress');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user, otherUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setWhitelistStatus(otherUser.address, true)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
