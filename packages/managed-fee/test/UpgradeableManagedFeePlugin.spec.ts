import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { Wallet, AbiCoder, keccak256 } from 'ethers';

describe('UpgradeableManagedFeePlugin', function () {
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

    // Deploy ManagedFeePluginImplementation
    const ManagedFeePluginImplementation = await ethers.getContractFactory('ManagedFeePluginImplementation');
    const managedFeeImpl = await ManagedFeePluginImplementation.deploy();

    // Deploy UpgradeableManagedFeePluginTest (implementation for beacon)
    const UpgradeableManagedFeePluginTest = await ethers.getContractFactory('UpgradeableManagedFeePluginTest');
    const pluginImplementation = await UpgradeableManagedFeePluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      managedFeeImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy BeaconProxy for first plugin
    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [mockPool.target]);
    await proxyDeployer.deploy(beacon.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();

    // Get plugin interface for proxy
    const plugin1 = UpgradeableManagedFeePluginTest.attach(proxy1Address) as any;

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
      managedFeeImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableManagedFeePluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  async function generatePluginData(
    nonce: string,
    fee: number,
    user: string,
    expireTime: number,
    signer: any
  ): Promise<string> {
    const hash = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint24', 'address', 'uint32'],
        [nonce, fee, user, expireTime]
      )
    );

    const hashBytes = Buffer.from(hash.slice(2), 'hex');
    const signature = await signer.signMessage(hashBytes);

    return AbiCoder.defaultAbiCoder().encode(
      ['tuple(bytes32, uint24, address, uint32, bytes)'],
      [[nonce, fee, user, expireTime, signature]]
    );
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
    });

    it('should have Managed Fee Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.activeModules(0);
      expect(modules).to.equal('Managed Fee Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target)
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
        beacon,
        pluginImplementation,
        plugin1,
        UpgradeableManagedFeePluginTest,
        manager,
        user,
        otherUser,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [mockPool2.target]);
      await proxyDeployer.deploy(beacon.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableManagedFeePluginTest.attach(proxy2Address) as any;

      // Verify different pool addresses
      expect(await plugin1.pool()).to.not.equal(await plugin2.pool());

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
        beacon,
        mockFactory,
        proxyDeployer,
        pluginImplementation,
        plugin1,
        UpgradeableManagedFeePluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const initData2 = pluginImplementation.interface.encodeFunctionData('initialize', [mockPool2.target]);
      await proxyDeployer.deploy(beacon.target, initData2);
      const proxy2Address = await proxyDeployer.lastDeployedProxy();
      const plugin2 = UpgradeableManagedFeePluginTest.attach(proxy2Address) as any;

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
