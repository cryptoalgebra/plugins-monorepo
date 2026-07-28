import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

describe('PermissionedPoolPlugin', function () {
  const SQRT_PRICE_TICK_0 = BigInt('79228162514264337593543950336');

  async function deployFixture() {
    const [owner, manager, issuer, permissionedManager, allowedUser, disallowedUser] = await ethers.getSigners();

    // Core mocks
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token0 = await MockERC20.deploy('Token0', 'TK0', 18);
    const token1 = await MockERC20.deploy('Token1', 'TK1', 18);
    await mockPool.setTokens(token0.target, token1.target);

    // Permissions Adapter Factory
    const PermissionsAdapterFactory = await ethers.getContractFactory('PermissionsAdapterFactory');
    const adapterFactory = await PermissionsAdapterFactory.deploy(mockFactory.target);

    const PERMISSIONED_POOL_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('PERMISSIONED_POOL_MANAGER'));
    await mockFactory.grantRole(PERMISSIONED_POOL_MANAGER, permissionedManager.address);

    // Permissions Adapter for token0, registered + verified
    const PermissionsAdapter = await ethers.getContractFactory('PermissionsAdapter');
    const adapter0 = await PermissionsAdapter.deploy(token0.target, issuer.address);
    await adapterFactory.connect(issuer).registerAdapter(token0.target, adapter0.target);
    await adapterFactory.connect(permissionedManager).verifyAdapter(token0.target, true);
    await adapter0.connect(issuer).setAllowed(allowedUser.address, true);
    await adapter0.connect(issuer).setAllowed(owner.address, true);

    // Plugin implementation + beacon proxy plugin
    const PermissionedPoolPluginImplementation = await ethers.getContractFactory('PermissionedPoolPluginImplementation');
    const permissionedPoolImpl = await PermissionedPoolPluginImplementation.deploy();

    const UpgradeablePermissionedPoolPluginTest = await ethers.getContractFactory('UpgradeablePermissionedPoolPluginTest');
    const pluginImplementation = await UpgradeablePermissionedPoolPluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      permissionedPoolImpl.target
    );

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [mockPool.target, adapterFactory.target]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxy1Address = await proxyDeployer.lastDeployedProxy();

    const plugin1 = UpgradeablePermissionedPoolPluginTest.attach(proxy1Address) as any;
    await mockPool.setPlugin(proxy1Address);

    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    const MockRouter = await ethers.getContractFactory('MockRouter');

    return {
      owner,
      manager,
      issuer,
      permissionedManager,
      allowedUser,
      disallowedUser,
      mockFactory,
      proxyDeployer,
      mockPool,
      token0,
      token1,
      adapterFactory,
      adapter0,
      PermissionsAdapter,
      permissionedPoolImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeablePermissionedPoolPluginTest,
      MockRouter,
      ALGEBRA_BASE_PLUGIN_MANAGER,
      PERMISSIONED_POOL_MANAGER,
    };
  }

  // ---------------------------------------------------------------------------------------------
  describe('PermissionsAdapterFactory: register/verify', function () {
    it('registers an adapter and reports it as unverified until governance verifies it', async function () {
      const { adapterFactory, token1, issuer, permissionedManager, PermissionsAdapter } = await loadFixture(deployFixture);

      const adapter1 = await PermissionsAdapter.deploy(token1.target, issuer.address);
      await adapterFactory.connect(issuer).registerAdapter(token1.target, adapter1.target);

      expect(await adapterFactory.getAdapter(token1.target)).to.equal(adapter1.target);
      expect(await adapterFactory.isVerified(token1.target)).to.equal(false);

      await adapterFactory.connect(permissionedManager).verifyAdapter(token1.target, true);
      expect(await adapterFactory.isVerified(token1.target)).to.equal(true);
    });

    it('rejects registration from anyone other than the adapter admin', async function () {
      const { adapterFactory, token1, disallowedUser, issuer, PermissionsAdapter } = await loadFixture(deployFixture);

      const adapter1 = await PermissionsAdapter.deploy(token1.target, issuer.address);
      await expect(adapterFactory.connect(disallowedUser).registerAdapter(token1.target, adapter1.target)).to.be.revertedWith(
        'Only adapter admin'
      );
    });

    it('resets verification when an adapter registration is replaced', async function () {
      const { adapterFactory, token0, issuer, permissionedManager, PermissionsAdapter } = await loadFixture(deployFixture);

      expect(await adapterFactory.isVerified(token0.target)).to.equal(true);

      const replacement = await PermissionsAdapter.deploy(token0.target, issuer.address);
      await adapterFactory.connect(issuer).registerAdapter(token0.target, replacement.target);

      expect(await adapterFactory.getAdapter(token0.target)).to.equal(replacement.target);
      expect(await adapterFactory.isVerified(token0.target)).to.equal(false);
    });

    it('rejects verification from a non-manager', async function () {
      const { adapterFactory, token0, disallowedUser } = await loadFixture(deployFixture);

      await expect(adapterFactory.connect(disallowedUser).verifyAdapter(token0.target, true)).to.be.revertedWith(
        'Only Permissioned Pool manager'
      );
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Pool initialization', function () {
    it('succeeds when one token has a verified adapter and the other has none', async function () {
      const { mockPool, owner } = await loadFixture(deployFixture);

      await expect(mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0)).to.not.be.reverted;
    });

    it('reverts with NoVerifiedToken when neither token has an adapter', async function () {
      const {
        mockFactory,
        proxyDeployer,
        beacon,
        pluginImplementation,
        adapterFactory,
        token0,
        token1,
        owner,
        UpgradeablePermissionedPoolPluginTest,
      } = await loadFixture(deployFixture);

      const MockPool = await ethers.getContractFactory('MockPool');
      const freshPool = await MockPool.deploy();
      await freshPool.setTokens(token1.target, token1.target); // neither side is token0 (the only registered adapter)

      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [freshPool.target, adapterFactory.target]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      const freshPlugin = UpgradeablePermissionedPoolPluginTest.attach(proxyAddress) as any;
      await freshPool.setPlugin(proxyAddress);

      await expect(freshPool.connect(owner).initialize(SQRT_PRICE_TICK_0)).to.be.revertedWithCustomError(
        freshPlugin,
        'NoVerifiedToken'
      );
    });

    it('reverts with UnverifiedTokenAdapter when a token has a registered-but-unverified adapter', async function () {
      const {
        mockFactory,
        proxyDeployer,
        beacon,
        pluginImplementation,
        adapterFactory,
        token0,
        token1,
        issuer,
        owner,
        PermissionsAdapter,
        UpgradeablePermissionedPoolPluginTest,
      } = await loadFixture(deployFixture);

      const adapter1 = await PermissionsAdapter.deploy(token1.target, issuer.address);
      await adapterFactory.connect(issuer).registerAdapter(token1.target, adapter1.target);
      // Note: not verified

      const MockPool = await ethers.getContractFactory('MockPool');
      const freshPool = await MockPool.deploy();
      await freshPool.setTokens(token0.target, token1.target);

      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [freshPool.target, adapterFactory.target]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      const freshPlugin = UpgradeablePermissionedPoolPluginTest.attach(proxyAddress) as any;
      await freshPool.setPlugin(proxyAddress);

      await expect(freshPool.connect(owner).initialize(SQRT_PRICE_TICK_0))
        .to.be.revertedWithCustomError(freshPlugin, 'UnverifiedTokenAdapter')
        .withArgs(token1.target);
    });

    it('bypasses all checks when permissionsAdapterFactory is address(0)', async function () {
      const { mockFactory, proxyDeployer, beacon, pluginImplementation, token0, token1, owner } = await loadFixture(deployFixture);

      const MockPool = await ethers.getContractFactory('MockPool');
      const freshPool = await MockPool.deploy();
      await freshPool.setTokens(token0.target, token1.target);

      const initData = pluginImplementation.interface.encodeFunctionData('initialize', [freshPool.target, ethers.ZeroAddress]);
      await proxyDeployer.deploy(beacon.target, freshPool.target, initData);
      const proxyAddress = await proxyDeployer.lastDeployedProxy();
      await freshPool.setPlugin(proxyAddress);

      await expect(freshPool.connect(owner).initialize(SQRT_PRICE_TICK_0)).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Swap: direct callers', function () {
    it('allows an allowed EOA to swap directly', async function () {
      const { mockPool, owner, allowedUser } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(allowedUser).swapToTick(10)).to.not.be.reverted;
    });

    it('blocks a disallowed EOA from swapping directly', async function () {
      const { mockPool, owner, disallowedUser, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(disallowedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });
  });

  describe('Swap: via routers (two-level check)', function () {
    it('allows a trusted router reporting an allowed real user', async function () {
      const { mockPool, owner, allowedUser, adapterFactory, permissionedManager, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const router = await MockRouter.deploy(allowedUser.address);
      await adapterFactory.connect(permissionedManager).setRouterAllowed(router.target, true);

      await expect(router.callSwap(mockPool.target, 10)).to.not.be.reverted;
    });

    it('blocks a trusted router reporting a disallowed real user', async function () {
      const { mockPool, owner, disallowedUser, adapterFactory, permissionedManager, MockRouter, plugin1, token0 } = await loadFixture(
        deployFixture
      );
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const router = await MockRouter.deploy(disallowedUser.address);
      await adapterFactory.connect(permissionedManager).setRouterAllowed(router.target, true);

      await expect(router.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });

    it('ignores an untrusted router self-report and checks the router itself instead', async function () {
      const { mockPool, owner, allowedUser, MockRouter, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      // Router lies that the real sender is `allowedUser`, but is NOT a registered router.
      const router = await MockRouter.deploy(allowedUser.address);

      await expect(router.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, router.target);
    });
  });

  describe('Swap: swappingEnabled kill switch', function () {
    it('blocks an allowed user when swappingEnabled is false, independent of the allowlist', async function () {
      const { mockPool, owner, allowedUser, adapter0, issuer, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await adapter0.connect(issuer).setSwappingEnabled(false);

      await expect(mockPool.connect(allowedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'SwappingDisabled')
        .withArgs(token0.target);
    });

    it('resumes allowing swaps once swappingEnabled is re-enabled', async function () {
      const { mockPool, owner, allowedUser, adapter0, issuer } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await adapter0.connect(issuer).setSwappingEnabled(false);
      await adapter0.connect(issuer).setSwappingEnabled(true);

      await expect(mockPool.connect(allowedUser).swapToTick(10)).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Add liquidity: allowlist only, no swappingEnabled check', function () {
    it('allows an allowed user to add liquidity even when swappingEnabled is false', async function () {
      const { mockPool, owner, allowedUser, adapter0, issuer } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await adapter0.connect(issuer).setSwappingEnabled(false);

      await expect(mockPool.connect(allowedUser).mint(allowedUser.address, allowedUser.address, -60, 60, 1000, '0x')).to.not.be
        .reverted;
    });

    it('blocks a disallowed user from adding liquidity regardless of swappingEnabled', async function () {
      const { mockPool, owner, disallowedUser, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(disallowedUser).mint(disallowedUser.address, disallowedUser.address, -60, 60, 1000, '0x'))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });
  });

  describe('Remove liquidity', function () {
    it('always allows remove liquidity regardless of allowlist or swappingEnabled', async function () {
      const { mockPool, owner, disallowedUser, adapter0, issuer } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await adapter0.connect(issuer).setSwappingEnabled(false);

      await expect(mockPool.connect(disallowedUser).burn(-60, 60, 1000, '0x')).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Flash: gated like swap', function () {
    it('allows an allowed user to flash', async function () {
      const { mockPool, owner, allowedUser } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(allowedUser).flash(allowedUser.address, 100, 100, '0x')).to.not.be.reverted;
    });

    it('blocks a disallowed user from flash', async function () {
      const { mockPool, owner, disallowedUser, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(disallowedUser).flash(disallowedUser.address, 100, 100, '0x'))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });

    it('blocks flash when swappingEnabled is false', async function () {
      const { mockPool, owner, allowedUser, adapter0, issuer, plugin1, token0 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await adapter0.connect(issuer).setSwappingEnabled(false);

      await expect(mockPool.connect(allowedUser).flash(allowedUser.address, 100, 100, '0x'))
        .to.be.revertedWithCustomError(plugin1, 'SwappingDisabled')
        .withArgs(token0.target);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Both tokens checked independently', function () {
    it('gates on token1 too when token1 has its own verified adapter with a different allowlist', async function () {
      const {
        mockPool,
        owner,
        allowedUser,
        disallowedUser,
        adapterFactory,
        permissionedManager,
        token0,
        token1,
        plugin1,
        PermissionsAdapter,
      } = await loadFixture(deployFixture);

      // token1 is permissioned too, but only allows `disallowedUser` (the opposite of token0's allowlist)
      const adapter1 = await PermissionsAdapter.deploy(token1.target, permissionedManager.address);
      await adapterFactory.connect(permissionedManager).registerAdapter(token1.target, adapter1.target);
      await adapterFactory.connect(permissionedManager).verifyAdapter(token1.target, true);
      await adapter1.connect(permissionedManager).setAllowed(disallowedUser.address, true);

      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      // allowedUser passes token0's check but fails token1's check -> overall blocked
      await expect(mockPool.connect(allowedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token1.target, allowedUser.address);

      // disallowedUser fails token0's check (token0 is checked first) -> overall blocked, even
      // though disallowedUser is on token1's allowlist
      await expect(mockPool.connect(disallowedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Authorization', function () {
    it('allows the manager role to set the Permissions Adapter Factory', async function () {
      const { plugin1, manager, adapterFactory } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setPermissionsAdapterFactory(ethers.ZeroAddress))
        .to.emit(plugin1, 'PermissionsAdapterFactoryUpdated')
        .withArgs(ethers.ZeroAddress);

      expect(await plugin1.getPermissionsAdapterFactory()).to.equal(ethers.ZeroAddress);
    });

    it('rejects a non-manager setting the Permissions Adapter Factory', async function () {
      const { plugin1, disallowedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(disallowedUser).setPermissionsAdapterFactory(ethers.ZeroAddress)).to.be.revertedWith(
        'Not authorized'
      );
    });
  });
});
