import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('UpgradeablePriceConvergencePlugin', function () {
  const SQRT_PRICE_TICK_0 = BigInt('79228162514264337593543950336');

  async function deployFixture() {
    const [owner, manager, vault, otherUser] = await ethers.getSigners();

    // Deploy MockFactory (acts as AlgebraFactory for role checks)
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy BeaconProxyDeployer (acts as pluginFactory for initializer gating)
    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy PriceConvergencePluginImplementation
    const PriceConvergencePluginImplementation = await ethers.getContractFactory('PriceConvergencePluginImplementation');
    const priceConvergenceImpl = await PriceConvergencePluginImplementation.deploy();

    // Deploy UpgradeablePriceConvergencePluginTest (implementation for beacon)
    const UpgradeablePriceConvergencePluginTest = await ethers.getContractFactory('UpgradeablePriceConvergencePluginTest');
    const pluginImplementation = await UpgradeablePriceConvergencePluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      priceConvergenceImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));

    // Unlike most other packages, this plugin's initialize() has no onlyPluginFactory gate -
    // it goes through the normal _authorize() check instead, and during beacon-proxy
    // construction msg.sender there is the deployer contract itself, so it needs the role too.
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, proxyDeployer.target);

    // Deploy BeaconProxy for first plugin (no init args - vault is set later via setVault)
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', []);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();

    // Get plugin interface for proxy
    const plugin1 = UpgradeablePriceConvergencePluginTest.attach(proxy1Address) as any;

    // Set plugin in mock pool
    await mockPool.setPlugin(proxy1Address);

    // Unlike other packages' test harnesses, UpgradeablePriceConvergencePluginTest does not
    // override beforeInitialize() to push its config into the pool, so MockPool's
    // pluginConfig stays 0 (and beforeModifyPosition is never invoked) unless set explicitly.
    await mockPool.setPluginConfig(await plugin1.defaultPluginConfig());

    // Grant manager role to manager (for setVault authorization tests)
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      vault,
      otherUser,
      mockFactory,
      proxyDeployer,
      mockPool,
      priceConvergenceImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeablePriceConvergencePluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct pool', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
    });

    it('should have Price Convergence Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Price Convergence Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      await expect(plugin1.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_POSITION_MODIFY_FLAG = 1 << 2 = 4
      const BEFORE_POSITION_MODIFY_FLAG = 1n << 2n;

      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(BEFORE_POSITION_MODIFY_FLAG);
    });

    it('should start with no vault set', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      expect(await plugin1.vault()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Vault management', function () {
    it('should allow manager to set the vault', async function () {
      const { plugin1, manager, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setVault(vault.address)).to.emit(plugin1, 'Vault').withArgs(vault.address);

      expect(await plugin1.vault()).to.equal(vault.address);
    });

    it('should allow owner to set the vault', async function () {
      const { plugin1, owner, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(owner).setVault(vault.address)).to.emit(plugin1, 'Vault').withArgs(vault.address);
    });

    it('should reject setVault from an unauthorized caller', async function () {
      const { plugin1, otherUser, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(otherUser).setVault(vault.address)).to.be.revertedWithCustomError(
        plugin1,
        'OnlyAdministrator'
      );
    });

    it('should reject setting the vault to the zero address', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setVault(ethers.ZeroAddress)).to.be.revertedWith('Vault must be non zero');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate vault storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        proxyDeployer,
        UpgradeablePriceConvergencePluginTest,
        manager,
        vault,
      } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setVault(vault.address);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', []);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeablePriceConvergencePluginTest.attach(proxy2Address) as any;

      // Verify different values
      expect(await plugin1.vault()).to.equal(vault.address);
      expect(await plugin2.vault()).to.equal(ethers.ZeroAddress);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const { beacon, mockFactory, proxyDeployer, pluginImplementation, plugin1, UpgradeablePriceConvergencePluginTest } =
        await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', []);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeablePriceConvergencePluginTest.attach(proxy2Address) as any;

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Position modify hook (vault gating)', function () {
    it('should allow the vault to add liquidity', async function () {
      const { mockPool, owner, manager, vault, plugin1 } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setVault(vault.address);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(vault).mint(vault.address, vault.address, -60, 60, 1000, '0x')).to.not.be.reverted;
    });

    it('should block a non-vault caller from adding liquidity', async function () {
      const { mockPool, owner, manager, vault, otherUser, plugin1 } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setVault(vault.address);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(
        mockPool.connect(otherUser).mint(otherUser.address, otherUser.address, -60, 60, 1000, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'OnlyVault');
    });

    it('should allow the vault to remove liquidity', async function () {
      const { mockPool, owner, manager, vault, plugin1 } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setVault(vault.address);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(vault).burn(-60, 60, 1000, '0x')).to.not.be.reverted;
    });

    it('should block a non-vault caller from removing liquidity too', async function () {
      const { mockPool, owner, manager, vault, otherUser, plugin1 } = await loadFixture(deployFixture);
      await plugin1.connect(manager).setVault(vault.address);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(otherUser).burn(-60, 60, 1000, '0x')).to.be.revertedWithCustomError(
        plugin1,
        'OnlyVault'
      );
    });

    it('should block any position modification when no vault is set yet', async function () {
      const { mockPool, owner, otherUser, plugin1 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(
        mockPool.connect(otherUser).mint(otherUser.address, otherUser.address, -60, 60, 1000, '0x')
      ).to.be.revertedWithCustomError(plugin1, 'OnlyVault');
    });
  });

  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(owner).setVault(vault.address)).to.emit(plugin1, 'Vault');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setVault(vault.address)).to.emit(plugin1, 'Vault');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, otherUser, vault } = await loadFixture(deployFixture);

      await expect(plugin1.connect(otherUser).setVault(vault.address)).to.be.revertedWithCustomError(
        plugin1,
        'OnlyAdministrator'
      );
    });
  });
});
