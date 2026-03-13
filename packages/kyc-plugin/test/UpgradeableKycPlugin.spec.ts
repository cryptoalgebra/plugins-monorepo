import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeableKycPlugin', function () {
  async function deployFixture() {
    const [owner, manager, whitelistedUser, nonWhitelistedUser, kycManager, kycPauser] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy BeaconProxyDeployer (acts as pluginFactory for initializer gating)
    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy KycRegistry
    const KycRegistry = await ethers.getContractFactory('KycRegistry');
    const kycRegistry = await KycRegistry.deploy(mockFactory.target);

    // Deploy KycPluginImplementation
    const KycPluginImplementation = await ethers.getContractFactory('KycPluginImplementation');
    const kycImpl = await KycPluginImplementation.deploy();

    // Deploy UpgradeableKycPluginTest (implementation for beacon)
    const UpgradeableKycPluginTest = await ethers.getContractFactory('UpgradeableKycPluginTest');
    const pluginImplementation = await UpgradeableKycPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      kycImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy BeaconProxy for first plugin
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      mockPool.target,
      kycRegistry.target,
    ]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();

    // Get plugin interface for proxy
    const plugin1 = UpgradeableKycPluginTest.attach(proxy1Address) as any;

    // Set plugin in mock pool
    await mockPool.setPlugin(proxy1Address);

    // Grant manager role
    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    // Grant KYC roles
    const KYC_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('KYC_MANAGER'));
    const KYC_PAUSER = ethers.keccak256(ethers.toUtf8Bytes('KYC_PAUSER'));
    await mockFactory.grantRole(KYC_MANAGER, kycManager.address);
    await mockFactory.grantRole(KYC_PAUSER, kycPauser.address);

    // Whitelist the whitelisted user
    await kycRegistry.connect(kycManager).setWhitelisted(whitelistedUser.address, true);
    // Whitelist owner so pool.initialize() from owner works
    await kycRegistry.connect(kycManager).setWhitelisted(owner.address, true);

    return {
      owner,
      manager,
      whitelistedUser,
      nonWhitelistedUser,
      kycManager,
      kycPauser,
      mockFactory,
      proxyDeployer,
      mockPool,
      kycRegistry,
      kycImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableKycPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
      KYC_MANAGER,
      KYC_PAUSER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, kycRegistry } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.getKycRegistry()).to.equal(kycRegistry.target);
    });

    it('should have KYC Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('KYC Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, kycRegistry } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, kycRegistry.target)
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

  describe('KYC Registry Management', function () {
    it('should allow manager to set kycRegistry', async function () {
      const { plugin1, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'KycRegistryUpdated')
        .withArgs(nonWhitelistedUser.address);

      expect(await plugin1.getKycRegistry()).to.equal(nonWhitelistedUser.address);
    });

    it('should not allow non-manager to set kycRegistry', async function () {
      const { plugin1, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(nonWhitelistedUser).setKycRegistry(nonWhitelistedUser.address)
      ).to.be.revertedWith('Not authorized');
    });

    it('should allow setting kycRegistry to zero address (disables KYC)', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setKycRegistry(ethers.ZeroAddress);
      expect(await plugin1.getKycRegistry()).to.equal(ethers.ZeroAddress);
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
        .to.be.revertedWithCustomError(plugin1, 'KycNotWhitelisted');
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
      ).to.be.revertedWithCustomError(plugin1, 'KycNotWhitelisted');
    });
  });

  describe('Remove liquidity', function () {
    it('should always allow remove liquidity (even for non-whitelisted)', async function () {
      const { mockPool, nonWhitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // burn triggers beforeModifyPosition with negative liquidityDelta — should always be allowed
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
      ).to.be.revertedWithCustomError(plugin1, 'KycNotWhitelisted');
    });
  });

  describe('Initialize verification', function () {
    it('should allow whitelisted user to initialize pool', async function () {
      const { mockPool, whitelistedUser } = await loadFixture(deployFixture);

      // whitelistedUser initializes the pool — afterInitialize hook checks tx.origin
      await expect(
        mockPool.connect(whitelistedUser).initialize(BigInt('79228162514264337593543950336'))
      ).to.not.be.reverted;
    });

    it('should block non-whitelisted user from initializing pool', async function () {
      const { nonWhitelistedUser, beacon, pluginImplementation, kycRegistry, proxyDeployer, UpgradeableKycPluginTest } = await loadFixture(deployFixture);

      // Need a fresh pool for initialize
      const MockPool = await ethers.getContractFactory('MockPool');
      const freshPool = await MockPool.deploy();

      // Deploy a fresh plugin proxy for this pool
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
        freshPool.target,
        kycRegistry.target,
      ]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      const freshPlugin = UpgradeableKycPluginTest.attach(proxyAddress) as any;
      await freshPool.setPlugin(proxyAddress);

      await expect(
        freshPool.connect(nonWhitelistedUser).initialize(BigInt('79228162514264337593543950336'))
      ).to.be.revertedWithCustomError(freshPlugin, 'KycNotWhitelisted');
    });
  });

  describe('KYC bypass scenarios', function () {
    it('should allow all operations when kycRegistry is zero address', async function () {
      const { plugin1, mockPool, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      // Set registry to zero — disables KYC
      await plugin1.connect(manager).setKycRegistry(ethers.ZeroAddress);

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

    it('should allow all operations when KYC is paused', async function () {
      const { mockPool, kycRegistry, kycPauser, nonWhitelistedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // Pause KYC
      await kycRegistry.connect(kycPauser).pause();

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
      const { mockPool, kycRegistry, kycPauser, kycManager, nonWhitelistedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(BigInt('79228162514264337593543950336'));

      // Pause, then unpause
      await kycRegistry.connect(kycPauser).pause();
      await kycRegistry.connect(kycManager).unpause();

      // Non-whitelisted user should be blocked again
      await expect(mockPool.connect(nonWhitelistedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'KycNotWhitelisted');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        kycRegistry,
        UpgradeableKycPluginTest,
        manager,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second KycRegistry
      const KycRegistry = await ethers.getContractFactory('KycRegistry');
      const kycRegistry2 = await KycRegistry.deploy((await ethers.getSigners())[0].address);

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        kycRegistry2.target,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableKycPluginTest.attach(proxy2Address) as any;

      // Verify different values
      expect(await plugin1.getKycRegistry()).to.equal(kycRegistry.target);
      expect(await plugin2.getKycRegistry()).to.equal(kycRegistry2.target);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        beacon,
        mockFactory,
        pluginImplementation,
        plugin1,
        UpgradeableKycPluginTest,
        proxyDeployer,
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
      const plugin2 = UpgradeableKycPluginTest.attach(proxy2Address) as any;

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

      await expect(plugin1.connect(owner).setKycRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'KycRegistryUpdated');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycRegistry(nonWhitelistedUser.address))
        .to.emit(plugin1, 'KycRegistryUpdated');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, nonWhitelistedUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(nonWhitelistedUser).setKycRegistry(nonWhitelistedUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
