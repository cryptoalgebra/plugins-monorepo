import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeableFeeDiscountPlugin', function () {
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

    // Deploy MockFeeDiscountRegistry
    const MockFeeDiscountRegistry = await ethers.getContractFactory('MockFeeDiscountRegistry');
    const mockFeeDiscountRegistry = await MockFeeDiscountRegistry.deploy();

    // Deploy FeeDiscountPluginImplementation
    const FeeDiscountPluginImplementation = await ethers.getContractFactory('FeeDiscountPluginImplementation');
    const feeDiscountImpl = await FeeDiscountPluginImplementation.deploy();

    // Deploy UpgradeableFeeDiscountPluginTest (implementation for beacon)
    const UpgradeableFeeDiscountPluginTest = await ethers.getContractFactory('UpgradeableFeeDiscountPluginTest');
    const pluginImplementation = await UpgradeableFeeDiscountPluginTest.deploy(
      mockFactory.target,
      mockPluginFactory.target,
      feeDiscountImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy BeaconProxy for first plugin
    const BeaconProxy = await ethers.getContractFactory('BeaconProxy');
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      mockFeeDiscountRegistry.target,
    ]);
    const proxy1 = await BeaconProxy.deploy(beacon.target, initData);

    // Get plugin interface for proxy
    const plugin1 = UpgradeableFeeDiscountPluginTest.attach(proxy1.target) as any;

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
      mockFeeDiscountRegistry,
      feeDiscountImpl,
      pluginImplementation,
      beacon,
      plugin1,
      BeaconProxy,
      UpgradeableFeeDiscountPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, mockFeeDiscountRegistry } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.feeDiscountRegistry.staticCall()).to.equal(mockFeeDiscountRegistry.target);
    });

    it('should have Fee Discount Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.activeModules(0);
      expect(modules).to.equal('Fee Discount Plugin');
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

      expect(await plugin1.feeDiscountRegistry.staticCall()).to.equal(otherUser.address);
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
      expect(await plugin1.feeDiscountRegistry.staticCall()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        mockPool,
        mockFeeDiscountRegistry,
        BeaconProxy,
        UpgradeableFeeDiscountPluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second MockFeeDiscountRegistry
      const MockFeeDiscountRegistry = await ethers.getContractFactory('MockFeeDiscountRegistry');
      const mockFeeDiscountRegistry2 = await MockFeeDiscountRegistry.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        mockFeeDiscountRegistry2.target,
      ]);
      const proxy2 = await BeaconProxy.deploy(beacon.target, initData2);
      const plugin2 = UpgradeableFeeDiscountPluginTest.attach(proxy2.target) as any;

      // Verify different values
      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin2.pool()).to.equal(mockPool2.target);

      expect(await plugin1.feeDiscountRegistry.staticCall()).to.equal(mockFeeDiscountRegistry.target);
      expect(await plugin2.feeDiscountRegistry.staticCall()).to.equal(mockFeeDiscountRegistry2.target);
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
        UpgradeableFeeDiscountPluginTest,
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
      const plugin2 = UpgradeableFeeDiscountPluginTest.attach(proxy2.target) as any;

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
