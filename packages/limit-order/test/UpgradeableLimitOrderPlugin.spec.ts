import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeableLimitOrderPlugin', function () {
  async function deployFixture() {
    const [owner, manager, user, otherUser] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy MockPluginFactory
    const MockPluginFactory = await ethers.getContractFactory('MockPluginFactory');
    const mockPluginFactory = await MockPluginFactory.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy MockLimitOrderManager
    const MockLimitOrderManager = await ethers.getContractFactory('MockLimitOrderManager');
    const mockLimitOrderManager = await MockLimitOrderManager.deploy();

    // Deploy LimitOrderPluginImplementation
    const LimitOrderPluginImplementation = await ethers.getContractFactory('LimitOrderPluginImplementation');
    const limitOrderImpl = await LimitOrderPluginImplementation.deploy();

    // Deploy UpgradeableLimitOrderPluginTest (implementation for beacon)
    const UpgradeableLimitOrderPluginTest = await ethers.getContractFactory('UpgradeableLimitOrderPluginTest');
    const pluginImplementation = await UpgradeableLimitOrderPluginTest.deploy(
      mockFactory.target,
      mockPluginFactory.target,
      limitOrderImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy BeaconProxy for first plugin
    const BeaconProxy = await ethers.getContractFactory('BeaconProxy');
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      mockLimitOrderManager.target,
    ]);
    const proxy1 = await BeaconProxy.deploy(beacon.target, initData);

    // Get plugin interface for proxy
    const plugin1 = UpgradeableLimitOrderPluginTest.attach(proxy1.target) as any;

    // Set plugin in mock pool
    await mockPool.setPlugin(proxy1.target);

    // Grant manager role to manager
    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      user,
      otherUser,
      mockFactory,
      mockPluginFactory,
      mockPool,
      mockLimitOrderManager,
      limitOrderImpl,
      pluginImplementation,
      beacon,
      plugin1,
      BeaconProxy,
      UpgradeableLimitOrderPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, mockLimitOrderManager } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager.target);
    });

    it('should have Limit Order Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.activeModules(0);
      expect(modules).to.equal('Limit Order Plugin');
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
        beacon,
        mockFactory,
        mockPluginFactory,
        pluginImplementation,
        plugin1,
        mockPool,
        mockLimitOrderManager,
        BeaconProxy,
        UpgradeableLimitOrderPluginTest,
        manager,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second MockLimitOrderManager
      const MockLimitOrderManager = await ethers.getContractFactory('MockLimitOrderManager');
      const mockLimitOrderManager2 = await MockLimitOrderManager.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        mockLimitOrderManager2.target,
      ]);
      const proxy2 = await BeaconProxy.deploy(beacon.target, initData2);
      const plugin2 = UpgradeableLimitOrderPluginTest.attach(proxy2.target) as any;

      // Verify different values
      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin2.pool()).to.equal(mockPool2.target);

      expect(await plugin1.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager.target);
      expect(await plugin2.limitOrderManager.staticCall()).to.equal(mockLimitOrderManager2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        beacon,
        mockFactory,
        mockPluginFactory,
        pluginImplementation,
        plugin1,
        BeaconProxy,
        UpgradeableLimitOrderPluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        ethers.ZeroAddress,
      ]);
      const proxy2 = await BeaconProxy.deploy(beacon.target, initData2);
      const plugin2 = UpgradeableLimitOrderPluginTest.attach(proxy2.target) as any;

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(mockPluginFactory.target);
      expect(await plugin2.pluginFactory()).to.equal(mockPluginFactory.target);
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
