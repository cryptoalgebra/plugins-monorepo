import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeableSecurityPlugin', function () {
  async function deployFixture() {
    const [owner, manager, user, otherUser] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy BeaconProxyDeployer (acts as pluginFactory for initializer gating)
    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy MockSecurityRegistry
    const MockSecurityRegistry = await ethers.getContractFactory('MockSecurityRegistry');
    const mockSecurityRegistry = await MockSecurityRegistry.deploy();

    // Deploy SecurityPluginImplementation
    const SecurityPluginImplementation = await ethers.getContractFactory('SecurityPluginImplementation');
    const securityImpl = await SecurityPluginImplementation.deploy();

    // Deploy UpgradeableSecurityPluginTest (implementation for beacon)
    const UpgradeableSecurityPluginTest = await ethers.getContractFactory('UpgradeableSecurityPluginTest');
    const pluginImplementation = await UpgradeableSecurityPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      securityImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy BeaconProxy for first plugin
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      mockSecurityRegistry.target,
    ]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();

    // Get plugin interface for proxy
    const plugin1 = UpgradeableSecurityPluginTest.attach(proxy1Address) as any;

    // Set plugin in mock pool
    await mockPool.setPlugin(proxy1Address);

    // Grant manager role to manager
    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      user,
      otherUser,
      mockFactory,
      proxyDeployer,
      mockPool,
      mockSecurityRegistry,
      securityImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableSecurityPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
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
      const {
        beacon,
        pluginImplementation,
        plugin1,
        mockPool,
        mockSecurityRegistry,
        UpgradeableSecurityPluginTest,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second MockSecurityRegistry
      const MockSecurityRegistry = await ethers.getContractFactory('MockSecurityRegistry');
      const mockSecurityRegistry2 = await MockSecurityRegistry.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        mockSecurityRegistry2.target,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableSecurityPluginTest.attach(proxy2Address) as any;

      // Verify different values
      expect(await plugin1.getSecurityRegistry()).to.equal(mockSecurityRegistry.target);
      expect(await plugin2.getSecurityRegistry()).to.equal(mockSecurityRegistry2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        beacon,
        mockFactory,
        proxyDeployer,
        pluginImplementation,
        plugin1,
        UpgradeableSecurityPluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        ethers.ZeroAddress,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableSecurityPluginTest.attach(proxy2Address) as any;

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
});
