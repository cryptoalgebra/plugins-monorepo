import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool, ALGEBRA_BASE_PLUGIN_MANAGER } from 'test-utils/beaconPlugin';

describe('UpgradeableAccessListPlugin', function () {
  const ACCESS_LIST_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ACCESS_LIST_MANAGER'));

  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableAccessListPluginTest',
      setup: async ({ owner, mockFactory, mockPool }) => {
        const [, , whitelistedUser, nonWhitelistedUser, accessListManager] = await ethers.getSigners();

        const accessListRegistry = await (await ethers.getContractFactory('AccessListRegistry')).deploy(mockFactory.target);
        const accessListImpl = await (await ethers.getContractFactory('AccessListPluginImplementation')).deploy();

        await mockFactory.grantRole(ACCESS_LIST_MANAGER, accessListManager.address);
        await accessListRegistry.connect(accessListManager).setWhitelisted(whitelistedUser.address, true);
        // Whitelist owner so pool.initialize() from owner works
        await accessListRegistry.connect(accessListManager).setWhitelisted(owner.address, true);

        return {
          pluginArgs: [accessListImpl.target],
          initArgs: [mockPool.target, accessListRegistry.target],
          extra: {
            whitelistedUser,
            nonWhitelistedUser,
            accessListManager,
            accessListRegistry,
            accessListImpl,
            ACCESS_LIST_MANAGER
          }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, accessListRegistry } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.getAccessListRegistry()).to.equal(accessListRegistry.target);
    });

    it('should have Access List Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Access List Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, accessListRegistry } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, accessListRegistry.target)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_SWAP_FLAG | BEFORE_FLASH_FLAG | BEFORE_POSITION_MODIFY_FLAG | AFTER_INIT_FLAG
      const BEFORE_SWAP_FLAG = 1n;
      const BEFORE_FLASH_FLAG = 1n << 4n;
      const BEFORE_POSITION_MODIFY_FLAG = 1n << 2n;
      const AFTER_INIT_FLAG = 1n << 6n;
      const expectedConfig = BEFORE_SWAP_FLAG | BEFORE_FLASH_FLAG | BEFORE_POSITION_MODIFY_FLAG | AFTER_INIT_FLAG;

      const config = await plugin1.defaultPluginConfig();
      expect(BigInt(config)).to.equal(expectedConfig);
    });
  });

  describe('Access List Registry Management', function () {
    it('should allow manager to set accessListRegistry', async function () {
      const { plugin1, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setAccessListRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'AccessListRegistryUpdated')
        .withArgs(nonWhitelistedUser.address);

      expect(await plugin1.getAccessListRegistry()).to.equal(nonWhitelistedUser.address);
    });

    it('should not allow non-manager to set accessListRegistry', async function () {
      const { plugin1, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(nonWhitelistedUser).setAccessListRegistry(nonWhitelistedUser.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should allow setting accessListRegistry to zero address (disables Access List)', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setAccessListRegistry(ethers.ZeroAddress);
      expect(await plugin1.getAccessListRegistry()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Swap verification', function () {
    it('should allow whitelisted user to swap', async function () {
      const { mockPool, whitelistedUser } = await loadFixture(deployFixture);

      // Initialize pool first (owner is whitelisted via direct test)
      await mockPool.initialize(BigInt('79228162514264337593543950336')); // sqrtPrice for tick 0

      // swapToTick triggers beforeSwap hook
      await expect(mockPool.connect(whitelistedUser).swapToTick(10)).to.not.be.reverted;
    });

    it('should block non-whitelisted user from swap', async function () {
      const { mockPool, nonWhitelistedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      await expect(mockPool.connect(nonWhitelistedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'AccessListNotWhitelisted');
    });
  });

  describe('Add liquidity verification', function () {
    it('should allow whitelisted user to add liquidity', async function () {
      const { mockPool, whitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // mint triggers beforeModifyPosition with positive liquidityDelta
      await expect(
        mockPool.connect(whitelistedUser).mint(whitelistedUser.address, whitelistedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
    });

    it('should block non-whitelisted user from adding liquidity', async function () {
      const { mockPool, nonWhitelistedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      await expect(
        mockPool.connect(nonWhitelistedUser).mint(nonWhitelistedUser.address, nonWhitelistedUser.address, -60, 60, 1000, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'AccessListNotWhitelisted');
    });
  });

  describe('Remove liquidity', function () {
    it('should always allow remove liquidity (even for non-whitelisted)', async function () {
      const { mockPool, nonWhitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // burn triggers beforeModifyPosition with negative liquidityDelta - should always be allowed
      await expect(
        mockPool.connect(nonWhitelistedUser).burn(-60, 60, 1000, '0x')
      ).to.not.be.reverted;
    });
  });

  describe('Flash verification', function () {
    it('should allow whitelisted user to flash', async function () {
      const { mockPool, whitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      await expect(
        mockPool.connect(whitelistedUser).flash(whitelistedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should block non-whitelisted user from flash', async function () {
      const { mockPool, nonWhitelistedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      await expect(
        mockPool.connect(nonWhitelistedUser).flash(nonWhitelistedUser.address, 100, 100, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'AccessListNotWhitelisted');
    });
  });

  describe('Initialize verification', function () {
    it('should allow whitelisted user to initialize pool', async function () {
      const { mockPool, whitelistedUser } = await loadFixture(deployFixture);

      // whitelistedUser initializes the pool - afterInitialize hook checks tx.origin
      await expect(
        mockPool.connect(whitelistedUser).initialize(BigInt('79228162514264337593543950336'))
      ).to.not.be.reverted;
    });

    it('should block non-whitelisted user from initializing pool', async function () {
      const { PluginContract, nonWhitelistedUser, beacon, pluginImplementation, accessListRegistry, proxyDeployer, UpgradeableAccessListPluginTest } = await loadFixture(deployFixture);

      // Need a fresh pool for initialize
      const freshPool = await deployMockPool();

      // Deploy a fresh plugin proxy for this pool
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
        freshPool.target,
        accessListRegistry.target,
      ]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      const freshPlugin = PluginContract.attach(proxyAddress) as any;
      await freshPool.setPlugin(proxyAddress);

      await expect(
        freshPool.connect(nonWhitelistedUser).initialize(BigInt('79228162514264337593543950336'))
      ).to.be.revertedWithCustomError(freshPlugin, 'AccessListNotWhitelisted');
    });
  });

  describe('Access List bypass scenarios', function () {
    it('should allow all operations when accessListRegistry is zero address', async function () {
      const { plugin1, mockPool, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      // Set registry to zero - disables Access List
      await plugin1.connect(manager).setAccessListRegistry(ethers.ZeroAddress);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // Non-whitelisted user should be able to do everything
      await expect(mockPool.connect(nonWhitelistedUser).swapToTick(10)).to.not.be.reverted;
      await expect(
        mockPool.connect(nonWhitelistedUser).mint(nonWhitelistedUser.address, nonWhitelistedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
      await expect(
        mockPool.connect(nonWhitelistedUser).flash(nonWhitelistedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should allow all operations when Access List is paused', async function () {
      const { mockPool, accessListRegistry, accessListManager, nonWhitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // Pause Access List
      await accessListRegistry.connect(accessListManager).pause();

      // Non-whitelisted user should be able to do everything
      await expect(mockPool.connect(nonWhitelistedUser).swapToTick(10)).to.not.be.reverted;
      await expect(
        mockPool.connect(nonWhitelistedUser).mint(nonWhitelistedUser.address, nonWhitelistedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
      await expect(
        mockPool.connect(nonWhitelistedUser).flash(nonWhitelistedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should resume blocking after unpause', async function () {
      const { mockPool, accessListRegistry, accessListManager, nonWhitelistedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // Pause, then unpause
      await accessListRegistry.connect(accessListManager).pause();
      await accessListRegistry.connect(accessListManager).unpause();

      // Non-whitelisted user should be blocked again
      await expect(mockPool.connect(nonWhitelistedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'AccessListNotWhitelisted');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        accessListRegistry,
        PluginContract,
        manager,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second AccessListRegistry
      const AccessListRegistry = await ethers.getContractFactory('AccessListRegistry');
      const accessListRegistry2 = await AccessListRegistry.deploy((await ethers.getSigners())[0].address);

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        accessListRegistry2.target,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = PluginContract.attach(proxy2Address) as any;

      // Verify different values
      expect(await plugin1.getAccessListRegistry()).to.equal(accessListRegistry.target);
      expect(await plugin2.getAccessListRegistry()).to.equal(accessListRegistry2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
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
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        ethers.ZeroAddress,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = PluginContract.attach(proxy2Address) as any;

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(owner).setAccessListRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'AccessListRegistryUpdated');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setAccessListRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'AccessListRegistryUpdated');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(nonWhitelistedUser).setAccessListRegistry(nonWhitelistedUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
