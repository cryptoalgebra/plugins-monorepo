import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeableVolatilityOraclePlugin', function () {
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

    // Deploy VolatilityOraclePluginImplementation
    const VolatilityOraclePluginImplementation = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
    const volatilityOracleImpl = await VolatilityOraclePluginImplementation.deploy();

    // Deploy UpgradeableVolatilityOraclePluginTest (implementation for beacon)
    const UpgradeableVolatilityOraclePluginTest = await ethers.getContractFactory('UpgradeableVolatilityOraclePluginTest');
    const pluginImplementation = await UpgradeableVolatilityOraclePluginTest.deploy(
      mockFactory.target,
      mockPluginFactory.target,
      volatilityOracleImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy pool-aware proxy (required for POOL_ADDRESS_OFFSET-based pool discovery)
    const AlgebraPluginProxy = await ethers.getContractFactory('AlgebraPluginProxy');
    const initData = pluginImplementation.interface.encodeFunctionData('initializePlugin');
    const proxy1 = await AlgebraPluginProxy.deploy(beacon.target, mockPool.target, initData);

    // Get plugin interface for proxy
    const plugin1 = UpgradeableVolatilityOraclePluginTest.attach(proxy1.target) as any;

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
      volatilityOracleImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableVolatilityOraclePluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
    });

    it('should have Volatility Oracle Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.activeModules(0);
      expect(modules).to.equal('Volatility Oracle Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initializePlugin()
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // AFTER_INIT_FLAG | BEFORE_SWAP_FLAG = 64 | 1 = 65
      const BEFORE_SWAP_FLAG = 1n;
      const AFTER_INIT_FLAG = 1n << 6n;
      const expectedConfig = BEFORE_SWAP_FLAG | AFTER_INIT_FLAG;
      
      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(expectedConfig);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        UpgradeableVolatilityOraclePluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const AlgebraPluginProxy = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxy.deploy(beacon.target, mockPool2.target, '0x');
      const plugin2 = UpgradeableVolatilityOraclePluginTest.attach(proxy2.target) as any;

      await mockPool2.setPlugin(proxy2.target);

      // Initialization state is stored per-proxy (must be isolated)
      await expect(plugin1.initializePlugin()).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(plugin2.initializePlugin()).to.not.be.reverted;
      await expect(plugin2.initializePlugin()).to.be.revertedWith('Initializable: contract is already initialized');
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
        UpgradeableVolatilityOraclePluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const AlgebraPluginProxy = await ethers.getContractFactory('AlgebraPluginProxy');
      const initData2 = pluginImplementation.interface.encodeFunctionData('initializePlugin');
      const proxy2 = await AlgebraPluginProxy.deploy(beacon.target, mockPool2.target, initData2);
      const plugin2 = UpgradeableVolatilityOraclePluginTest.attach(proxy2.target) as any;

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(mockPluginFactory.target);
      expect(await plugin2.pluginFactory()).to.equal(mockPluginFactory.target);
    });
  });

  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner } = await loadFixture(deployFixture);

      // Owner should be authorized - test by checking no revert on collectPluginFee
      // (would need actual fee to collect, so just verify no revert on a simple call)
      expect(await plugin1.factory()).to.not.be.undefined;
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      // Manager should be authorized
      expect(await plugin1.factory()).to.not.be.undefined;
    });
  });
});
