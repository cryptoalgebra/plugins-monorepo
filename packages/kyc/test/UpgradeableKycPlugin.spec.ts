import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

const KYC_TOPIC = 42n;
const INIT_PRICE = BigInt('79228162514264337593543950336'); // sqrtPrice for tick 0

describe('UpgradeableKycPlugin', function () {
  async function deployFixture() {
    const [owner, manager, verifiedUser, nonVerifiedUser] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy BeaconProxyDeployer (acts as pluginFactory for initializer gating)
    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy OnchainID mocks
    const MockIdFactory = await ethers.getContractFactory('MockIdFactory');
    const idFactory = await MockIdFactory.deploy();

    const MockClaimIssuer = await ethers.getContractFactory('MockClaimIssuer');
    const trustedIssuer = await MockClaimIssuer.deploy();
    const untrustedIssuer = await MockClaimIssuer.deploy();

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
      idFactory.target,
      KYC_TOPIC,
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

    // Trust the issuer on the plugin
    await plugin1.connect(manager).setKycTrustedIssuer(trustedIssuer.target, true);

    // Give the verified user an identity with a valid KYC claim
    const MockIdentity = await ethers.getContractFactory('MockIdentity');
    const verifiedIdentity = await MockIdentity.deploy();
    await verifiedIdentity.addClaim(KYC_TOPIC, 1, trustedIssuer.target, '0x1234', '0x5678', '');
    await idFactory.setIdentity(verifiedUser.address, verifiedIdentity.target);

    // Give owner an identity too so pool.initialize() from owner works
    const ownerIdentity = await MockIdentity.deploy();
    await ownerIdentity.addClaim(KYC_TOPIC, 1, trustedIssuer.target, '0x1234', '0x5678', '');
    await idFactory.setIdentity(owner.address, ownerIdentity.target);

    return {
      owner,
      manager,
      verifiedUser,
      nonVerifiedUser,
      mockFactory,
      proxyDeployer,
      mockPool,
      idFactory,
      trustedIssuer,
      untrustedIssuer,
      kycImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableKycPluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool, idFactory } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.kycIdentityFactory()).to.equal(idFactory.target);
      expect(await plugin1.kycRequiredTopic()).to.equal(KYC_TOPIC);
    });

    it('should have KYC Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('KYC Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool, idFactory } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, idFactory.target, KYC_TOPIC)
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

  describe('KYC Configuration Management', function () {
    it('should allow manager to set identity factory', async function () {
      const { plugin1, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycIdentityFactory(nonVerifiedUser.address))
        .to.emit(plugin1, 'KycIdentityFactoryUpdated')
        .withArgs(nonVerifiedUser.address);

      expect(await plugin1.kycIdentityFactory()).to.equal(nonVerifiedUser.address);
    });

    it('should allow manager to set required topic', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycRequiredTopic(7))
        .to.emit(plugin1, 'KycRequiredTopicUpdated')
        .withArgs(7);

      expect(await plugin1.kycRequiredTopic()).to.equal(7);
    });

    it('should allow manager to manage trusted issuers', async function () {
      const { plugin1, manager, untrustedIssuer } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycTrustedIssuer(untrustedIssuer.target, true))
        .to.emit(plugin1, 'KycTrustedIssuerUpdated')
        .withArgs(untrustedIssuer.target, true);

      expect(await plugin1.isKycTrustedIssuer(untrustedIssuer.target)).to.be.true;
    });

    it('should handle batch trusted issuers update', async function () {
      const { plugin1, manager, trustedIssuer, untrustedIssuer } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setKycTrustedIssuersBatch(
        [trustedIssuer.target, untrustedIssuer.target],
        [false, true]
      );

      expect(await plugin1.isKycTrustedIssuer(trustedIssuer.target)).to.be.false;
      expect(await plugin1.isKycTrustedIssuer(untrustedIssuer.target)).to.be.true;
    });

    it('should revert batch update with length mismatch', async function () {
      const { plugin1, manager, trustedIssuer, untrustedIssuer } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(manager).setKycTrustedIssuersBatch([trustedIssuer.target, untrustedIssuer.target], [true])
      ).to.be.revertedWith('Length mismatch');
    });

    it('should not allow non-manager to manage config', async function () {
      const { plugin1, nonVerifiedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(nonVerifiedUser).setKycIdentityFactory(nonVerifiedUser.address)).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(nonVerifiedUser).setKycRequiredTopic(7)).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(nonVerifiedUser).setKycTrustedIssuer(nonVerifiedUser.address, true)).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(nonVerifiedUser).setKycTrustedIssuersBatch([nonVerifiedUser.address], [true])).to.be.revertedWith('Not authorized');
      await expect(plugin1.connect(nonVerifiedUser).setKycPaused(true)).to.be.revertedWith('Not authorized');
    });

    it('should allow setting identity factory to zero address (disables KYC)', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setKycIdentityFactory(ethers.ZeroAddress);
      expect(await plugin1.kycIdentityFactory()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('isTraderEligible (frontend view)', function () {
    it('should return true for verified user', async function () {
      const { plugin1, verifiedUser } = await loadFixture(deployFixture);
      expect(await plugin1.isTraderEligible(verifiedUser.address)).to.be.true;
    });

    it('should return false for user without identity', async function () {
      const { plugin1, nonVerifiedUser } = await loadFixture(deployFixture);
      expect(await plugin1.isTraderEligible(nonVerifiedUser.address)).to.be.false;
    });

    it('should return false after claim revocation', async function () {
      const { plugin1, verifiedUser, trustedIssuer } = await loadFixture(deployFixture);

      await trustedIssuer.setClaimValid(false);
      expect(await plugin1.isTraderEligible(verifiedUser.address)).to.be.false;
    });

    it('should return false for claim from untrusted issuer', async function () {
      const { plugin1, nonVerifiedUser, untrustedIssuer, idFactory } = await loadFixture(deployFixture);

      const MockIdentity = await ethers.getContractFactory('MockIdentity');
      const identity = await MockIdentity.deploy();
      await identity.addClaim(KYC_TOPIC, 1, untrustedIssuer.target, '0x1234', '0x5678', '');
      await idFactory.setIdentity(nonVerifiedUser.address, identity.target);

      expect(await plugin1.isTraderEligible(nonVerifiedUser.address)).to.be.false;
    });

    it('should return true for anyone when KYC is disabled', async function () {
      const { plugin1, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setKycIdentityFactory(ethers.ZeroAddress);
      expect(await plugin1.isTraderEligible(nonVerifiedUser.address)).to.be.true;
    });

    it('should return true for anyone when KYC is paused', async function () {
      const { plugin1, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setKycPaused(true);
      expect(await plugin1.isTraderEligible(nonVerifiedUser.address)).to.be.true;
    });

    it('should match hook behavior: eligible user swaps, non-eligible reverts', async function () {
      const { plugin1, mockPool, verifiedUser, nonVerifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      expect(await plugin1.isTraderEligible(verifiedUser.address)).to.be.true;
      await expect(mockPool.connect(verifiedUser).swapToTick(10)).to.not.be.reverted;

      expect(await plugin1.isTraderEligible(nonVerifiedUser.address)).to.be.false;
      await expect(mockPool.connect(nonVerifiedUser).swapToTick(20))
        .to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });
  });

  describe('Swap verification', function () {
    it('should allow verified user to swap', async function () {
      const { mockPool, verifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      // swapToTick triggers beforeSwap hook
      await expect(mockPool.connect(verifiedUser).swapToTick(10)).to.not.be.reverted;
    });

    it('should block non-verified user from swap', async function () {
      const { mockPool, nonVerifiedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      await expect(mockPool.connect(nonVerifiedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });

    it('should block user after claim revocation', async function () {
      const { mockPool, verifiedUser, trustedIssuer, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      await trustedIssuer.setClaimValid(false);

      await expect(mockPool.connect(verifiedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });

    it('should block user with claim from untrusted issuer', async function () {
      const { mockPool, nonVerifiedUser, untrustedIssuer, idFactory, plugin1 } = await loadFixture(deployFixture);

      // Give the user an identity with a claim from an untrusted issuer
      const MockIdentity = await ethers.getContractFactory('MockIdentity');
      const identity = await MockIdentity.deploy();
      await identity.addClaim(KYC_TOPIC, 1, untrustedIssuer.target, '0x1234', '0x5678', '');
      await idFactory.setIdentity(nonVerifiedUser.address, identity.target);

      await mockPool.initialize(INIT_PRICE);

      await expect(mockPool.connect(nonVerifiedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });
  });

  describe('Add liquidity verification', function () {
    it('should allow verified user to add liquidity', async function () {
      const { mockPool, verifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      // mint triggers beforeModifyPosition with positive liquidityDelta
      await expect(
        mockPool.connect(verifiedUser).mint(verifiedUser.address, verifiedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
    });

    it('should block non-verified user from adding liquidity', async function () {
      const { mockPool, nonVerifiedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      await expect(
        mockPool.connect(nonVerifiedUser).mint(nonVerifiedUser.address, nonVerifiedUser.address, -60, 60, 1000, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });
  });

  describe('Remove liquidity', function () {
    it('should always allow remove liquidity (even for non-verified)', async function () {
      const { mockPool, nonVerifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      // burn triggers beforeModifyPosition with negative liquidityDelta — should always be allowed
      await expect(
        mockPool.connect(nonVerifiedUser).burn(-60, 60, 1000, '0x')
      ).to.not.be.reverted;
    });
  });

  describe('Flash verification', function () {
    it('should allow verified user to flash', async function () {
      const { mockPool, verifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      await expect(
        mockPool.connect(verifiedUser).flash(verifiedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should block non-verified user from flash', async function () {
      const { mockPool, nonVerifiedUser, plugin1 } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      await expect(
        mockPool.connect(nonVerifiedUser).flash(nonVerifiedUser.address, 100, 100, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });
  });

  describe('Initialize verification', function () {
    it('should allow verified user to initialize pool', async function () {
      const { mockPool, verifiedUser } = await loadFixture(deployFixture);

      // verifiedUser initializes the pool — afterInitialize hook checks tx.origin
      await expect(
        mockPool.connect(verifiedUser).initialize(INIT_PRICE)
      ).to.not.be.reverted;
    });

    it('should block non-verified user from initializing pool', async function () {
      const { nonVerifiedUser, beacon, pluginImplementation, idFactory, proxyDeployer, manager, trustedIssuer, UpgradeableKycPluginTest } = await loadFixture(deployFixture);

      // Need a fresh pool for initialize
      const MockPool = await ethers.getContractFactory('MockPool');
      const freshPool = await MockPool.deploy();

      // Deploy a fresh plugin proxy for this pool
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
        freshPool.target,
        idFactory.target,
        KYC_TOPIC,
      ]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      const freshPlugin = UpgradeableKycPluginTest.attach(proxyAddress) as any;
      await freshPool.setPlugin(proxyAddress);
      await freshPlugin.connect(manager).setKycTrustedIssuer(trustedIssuer.target, true);

      await expect(
        freshPool.connect(nonVerifiedUser).initialize(INIT_PRICE)
      ).to.be.revertedWithCustomError(freshPlugin, 'KycNotVerified');
    });
  });

  describe('KYC bypass scenarios', function () {
    it('should allow all operations when identity factory is zero address', async function () {
      const { plugin1, mockPool, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      // Set identity factory to zero — disables KYC
      await plugin1.connect(manager).setKycIdentityFactory(ethers.ZeroAddress);

      await mockPool.initialize(INIT_PRICE);

      // Non-verified user should be able to do everything
      await expect(mockPool.connect(nonVerifiedUser).swapToTick(10)).to.not.be.reverted;
      await expect(
        mockPool.connect(nonVerifiedUser).mint(nonVerifiedUser.address, nonVerifiedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
      await expect(
        mockPool.connect(nonVerifiedUser).flash(nonVerifiedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should allow all operations when KYC is paused', async function () {
      const { plugin1, mockPool, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      // Pause KYC
      await expect(plugin1.connect(manager).setKycPaused(true))
        .to.emit(plugin1, 'KycPausedUpdated')
        .withArgs(true);
      expect(await plugin1.isKycPaused()).to.be.true;

      // Non-verified user should be able to do everything
      await expect(mockPool.connect(nonVerifiedUser).swapToTick(10)).to.not.be.reverted;
      await expect(
        mockPool.connect(nonVerifiedUser).mint(nonVerifiedUser.address, nonVerifiedUser.address, -60, 60, 1000, '0x')
      ).to.not.be.reverted;
      await expect(
        mockPool.connect(nonVerifiedUser).flash(nonVerifiedUser.address, 100, 100, '0x')
      ).to.not.be.reverted;
    });

    it('should resume blocking after unpause', async function () {
      const { plugin1, mockPool, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await mockPool.initialize(INIT_PRICE);

      // Pause, then unpause
      await plugin1.connect(manager).setKycPaused(true);
      await plugin1.connect(manager).setKycPaused(false);

      // Non-verified user should be blocked again
      await expect(mockPool.connect(nonVerifiedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'KycNotVerified');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        idFactory,
        UpgradeableKycPluginTest,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second MockIdFactory
      const MockIdFactory = await ethers.getContractFactory('MockIdFactory');
      const idFactory2 = await MockIdFactory.deploy();

      // Deploy second proxy with different config
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [
        mockPool2.target,
        idFactory2.target,
        KYC_TOPIC + 1n,
      ]);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableKycPluginTest.attach(proxy2Address) as any;

      // Verify different values
      expect(await plugin1.kycIdentityFactory()).to.equal(idFactory.target);
      expect(await plugin1.kycRequiredTopic()).to.equal(KYC_TOPIC);
      expect(await plugin2.kycIdentityFactory()).to.equal(idFactory2.target);
      expect(await plugin2.kycRequiredTopic()).to.equal(KYC_TOPIC + 1n);
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
        0,
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
      const { plugin1, owner, nonVerifiedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(owner).setKycIdentityFactory(nonVerifiedUser.address))
        .to.emit(plugin1, 'KycIdentityFactoryUpdated');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, nonVerifiedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setKycIdentityFactory(nonVerifiedUser.address))
        .to.emit(plugin1, 'KycIdentityFactoryUpdated');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, nonVerifiedUser } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(nonVerifiedUser).setKycIdentityFactory(nonVerifiedUser.address)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
