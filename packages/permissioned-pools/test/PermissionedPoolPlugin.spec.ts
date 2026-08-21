import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, ALGEBRA_BASE_PLUGIN_MANAGER } from 'test-utils/beaconPlugin';

describe('PermissionedPoolPlugin', function () {
  const SQRT_PRICE_TICK_0 = BigInt('79228162514264337593543950336');

  const NONE = '0x0000';
  const SWAP_ALLOWED = '0x0001';
  const LIQUIDITY_ALLOWED = '0x0002';
  const ALL_ALLOWED = '0xffff';

  const PERMISSIONED_POOL_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('PERMISSIONED_POOL_MANAGER'));

  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeablePermissionedPoolPluginTest',
      setup: async ({ owner, mockFactory, mockPool }) => {
        const [, , permissionedManager, allowedUser, disallowedUser] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory('MockERC20');
        const token0 = await MockERC20.deploy('Token0', 'TK0', 18);
        const token1 = await MockERC20.deploy('Token1', 'TK1', 18);
        await mockPool.setTokens(token0.target, token1.target);

        const registry = await (await ethers.getContractFactory('AllowlistCheckerRegistry')).deploy(mockFactory.target);
        await mockFactory.grantRole(PERMISSIONED_POOL_MANAGER, permissionedManager.address);

        const MockAllowlistChecker = await ethers.getContractFactory('MockAllowlistChecker');
        const checker0 = await MockAllowlistChecker.deploy();
        await registry.connect(permissionedManager).setChecker(token0.target, checker0.target);
        await checker0.setFlags(allowedUser.address, ALL_ALLOWED);
        await checker0.setFlags(owner.address, ALL_ALLOWED);

        const permissionedPoolImpl = await (await ethers.getContractFactory('PermissionedPoolPluginImplementation')).deploy();
        const MockRouter = await ethers.getContractFactory('MockRouter');

        return {
          pluginArgs: [permissionedPoolImpl.target],
          initArgs: [mockPool.target, registry.target],
          extra: {
            permissionedManager,
            allowedUser,
            disallowedUser,
            token0,
            token1,
            registry,
            checker0,
            MockAllowlistChecker,
            permissionedPoolImpl,
            MockRouter,
            PERMISSIONED_POOL_MANAGER
          }
        };
      }
    });
  }
  describe('Pool initialization', function () {
    it('always succeeds, regardless of checker configuration', async function () {
      const { mockPool, owner } = await loadFixture(deployFixture);

      await expect(mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0)).to.not.be.reverted;
    });
  });

  describe('Swap: unregistered callers', function () {
    it('reverts with RouterNotAllowed even for an otherwise-eligible account', async function () {
      // MockPool.swapToTick lets any caller reach the hook directly, unlike a real pool where
      // swap/mint/flash require a callback only a contract can implement. This simulates the raw
      // hook sender being some address that was never registered as a router - in reality this
      // would be an unregistered contract, not literally an EOA.
      const { mockPool, owner, allowedUser, plugin1 } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(allowedUser).swapToTick(10))
        .to.be.revertedWithCustomError(plugin1, 'RouterNotAllowed')
        .withArgs(allowedUser.address);
    });
  });

  describe('Swap: via routers (two-level check)', function () {
    it('allows a trusted router reporting an allowed real user', async function () {
      const { mockPool, owner, allowedUser, plugin1, manager, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const router = await MockRouter.deploy(allowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callSwap(mockPool.target, 10)).to.not.be.reverted;
    });

    it('blocks a trusted router reporting a disallowed real user', async function () {
      const { mockPool, owner, disallowedUser, plugin1, manager, token0, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const router = await MockRouter.deploy(disallowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });

    it('reverts with RouterNotAllowed for an unregistered router, regardless of its self-report', async function () {
      const { mockPool, owner, allowedUser, plugin1, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      // Router claims the real sender is allowedUser, but was never approved via setRouterAllowed
      const router = await MockRouter.deploy(allowedUser.address);

      await expect(router.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'RouterNotAllowed')
        .withArgs(router.target);
    });
  });

  describe('Add liquidity: gated independently by LIQUIDITY_ALLOWED', function () {
    it('allows an account with LIQUIDITY_ALLOWED to add liquidity', async function () {
      const { mockPool, owner, allowedUser, checker0, plugin1, manager, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await checker0.setFlags(allowedUser.address, LIQUIDITY_ALLOWED);

      const router = await MockRouter.deploy(allowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callMint(mockPool.target, allowedUser.address, -60, 60, 1000)).to.not.be.reverted;
    });

    it('blocks an account with only SWAP_ALLOWED from adding liquidity', async function () {
      const { mockPool, owner, allowedUser, checker0, plugin1, manager, token0, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await checker0.setFlags(allowedUser.address, SWAP_ALLOWED);

      const router = await MockRouter.deploy(allowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callMint(mockPool.target, allowedUser.address, -60, 60, 1000))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, allowedUser.address);
    });

    it('blocks an account with no flags from adding liquidity', async function () {
      const { mockPool, owner, disallowedUser, plugin1, manager, token0, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const router = await MockRouter.deploy(disallowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callMint(mockPool.target, disallowedUser.address, -60, 60, 1000))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });
  });

  describe('Swap: gated independently by SWAP_ALLOWED', function () {
    it('blocks an account with only LIQUIDITY_ALLOWED from swapping', async function () {
      const { mockPool, owner, allowedUser, checker0, plugin1, manager, token0, MockRouter } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);
      await checker0.setFlags(allowedUser.address, LIQUIDITY_ALLOWED);

      const router = await MockRouter.deploy(allowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(router.target, true);

      await expect(router.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, allowedUser.address);
    });
  });

  describe('Remove liquidity', function () {
    it('always allows remove liquidity regardless of checker flags', async function () {
      const { mockPool, owner, disallowedUser } = await loadFixture(deployFixture);
      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      await expect(mockPool.connect(disallowedUser).burn(-60, 60, 1000, '0x')).to.not.be.reverted;
    });
  });

  describe('Both tokens checked independently', function () {
    it('gates on token1 too when token1 has its own checker with different flags', async function () {
      const {
        mockPool,
        owner,
        allowedUser,
        disallowedUser,
        registry,
        permissionedManager,
        token0,
        token1,
        plugin1,
        manager,
        MockAllowlistChecker,
        MockRouter,
      } = await loadFixture(deployFixture);

      const checker1 = await MockAllowlistChecker.deploy();
      await registry.connect(permissionedManager).setChecker(token1.target, checker1.target);
      await checker1.setFlags(disallowedUser.address, ALL_ALLOWED);

      await mockPool.connect(owner).initialize(SQRT_PRICE_TICK_0);

      const routerForAllowed = await MockRouter.deploy(allowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(routerForAllowed.target, true);
      const routerForDisallowed = await MockRouter.deploy(disallowedUser.address);
      await plugin1.connect(manager).setRouterAllowed(routerForDisallowed.target, true);

      // allowedUser passes token0's check but token1 has no flags set for it -> overall blocked
      await expect(routerForAllowed.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token1.target, allowedUser.address);

      // disallowedUser fails token0's check first (token0 is checked before token1)
      await expect(routerForDisallowed.callSwap(mockPool.target, 10))
        .to.be.revertedWithCustomError(plugin1, 'NotAllowed')
        .withArgs(token0.target, disallowedUser.address);
    });
  });

  describe('isTraderEligible', function () {
    it('returns the checker flags for a permissioned token', async function () {
      const { plugin1, allowedUser, token0 } = await loadFixture(deployFixture);

      expect(await plugin1.isTraderEligible(allowedUser.address, token0.target)).to.equal(ALL_ALLOWED);
    });

    it('returns NONE for a disallowed account', async function () {
      const { plugin1, disallowedUser, token0 } = await loadFixture(deployFixture);

      expect(await plugin1.isTraderEligible(disallowedUser.address, token0.target)).to.equal(NONE);
    });

    it('returns ALL_ALLOWED for a token with no checker assigned', async function () {
      const { plugin1, disallowedUser, token1 } = await loadFixture(deployFixture);

      expect(await plugin1.isTraderEligible(disallowedUser.address, token1.target)).to.equal(ALL_ALLOWED);
    });

    it('returns ALL_ALLOWED when the registry itself is unset', async function () {
      const { plugin1, manager, disallowedUser, token0 } = await loadFixture(deployFixture);

      await plugin1.connect(manager).setAllowlistCheckerRegistry(ethers.ZeroAddress);

      expect(await plugin1.isTraderEligible(disallowedUser.address, token0.target)).to.equal(ALL_ALLOWED);
    });
  });

  describe('Router management', function () {
    it('allows the manager to approve a router', async function () {
      const { plugin1, manager, MockRouter, disallowedUser } = await loadFixture(deployFixture);
      const router = await MockRouter.deploy(disallowedUser.address);

      await expect(plugin1.connect(manager).setRouterAllowed(router.target, true))
        .to.emit(plugin1, 'RouterAllowedUpdated')
        .withArgs(router.target, true);

      expect(await plugin1.allowedRouters(router.target)).to.equal(true);
    });

    it('rejects a non-manager approving a router', async function () {
      const { plugin1, disallowedUser, MockRouter } = await loadFixture(deployFixture);
      const router = await MockRouter.deploy(disallowedUser.address);

      await expect(plugin1.connect(disallowedUser).setRouterAllowed(router.target, true)).to.be.revertedWith('Not authorized');
    });
  });

  describe('Allowlist Checker Registry management', function () {
    it('allows the manager to set the registry', async function () {
      const { plugin1, manager, registry } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setAllowlistCheckerRegistry(registry.target))
        .to.emit(plugin1, 'AllowlistCheckerRegistryUpdated')
        .withArgs(registry.target);

      expect(await plugin1.getAllowlistCheckerRegistry()).to.equal(registry.target);
    });

    it('rejects a non-manager setting the registry', async function () {
      const { plugin1, disallowedUser } = await loadFixture(deployFixture);

      await expect(plugin1.connect(disallowedUser).setAllowlistCheckerRegistry(ethers.ZeroAddress)).to.be.revertedWith('Not authorized');
    });
  });
});
