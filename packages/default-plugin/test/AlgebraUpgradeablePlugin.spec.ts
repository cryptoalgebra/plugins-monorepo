import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'test-utils/expect';
import {
  DEFAULT_FEE_CONFIGURATION,
  ModuleImplementations,
  deployPluginFactory,
  impersonateContract,
  upgradeablePluginFixture,
} from './shared/fixtures';
import { PLUGIN_FLAGS, encodePriceSqrt, getMaxTick, getMinTick } from 'test-utils/utilities';

import { MockFactory, MockPool, MockTimeAlgebraUpgradeablePlugin, NewMockTimeUpgradeablePluginFactory, MockTimeVirtualPool } from '../typechain';

describe('AlgebraUpgradeablePlugin', () => {
  let wallet: Wallet, other: Wallet;

  let plugin: MockTimeAlgebraUpgradeablePlugin;
  let mockPool: MockPool;
  let mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  let mockFactory: MockFactory;
  let implementations: ModuleImplementations;

  let minTick = getMinTick(60);
  let maxTick = getMaxTick(60);

  async function initializeAtZeroTick(pool: MockPool) {
    await pool.initialize(encodePriceSqrt(1, 1));
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test AlgebraUpgradeablePlugin', async () => {
    ({ plugin, mockPool, mockPluginFactory, mockFactory, implementations } = await loadFixture(upgradeablePluginFixture));
  });

  describe('#Wiring', () => {
    it('every connector points at the implementation meant for it', async () => {
      // Same plugin with the immutables exposed, separate so the gas suite is unaffected
      const { mockPluginFactory: gettersFactory } = await deployPluginFactory(mockFactory, implementations, 'MockPluginWithModuleGetters');

      const algebraFactorySigner = await impersonateContract(mockFactory);
      await gettersFactory
        .connect(algebraFactorySigner)
        .beforeCreatePoolHook(mockPool, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, '0x');

      const withGetters = await ethers.getContractAt('MockPluginWithModuleGetters', await gettersFactory.pluginByPool(mockPool));
      const wired = await withGetters.moduleImplementations();

      expect(wired.volatilityOracle).to.be.eq(implementations.volatilityOracle);
      expect(wired.dynamicFee).to.be.eq(implementations.dynamicFee);
      expect(wired.farmingProxy).to.be.eq(implementations.farmingProxy);
      expect(wired.alm).to.be.eq(implementations.alm);
      expect(wired.security).to.be.eq(implementations.security);

      // A swap between two fields would still leave five distinct addresses, the equalities above are what catches it
      const addresses = [wired.volatilityOracle, wired.dynamicFee, wired.farmingProxy, wired.alm, wired.security];
      expect(new Set(addresses).size).to.be.eq(5);
    });

    it('stores the pool where POOL_ADDRESS_OFFSET expects to find it', async () => {
      // _getPool() extcodecopies the proxy at a hardcoded offset, correct for one compiler config only.
      // A solc or optimizer change moves the immutable and every hook starts reading garbage.
      const offset = Number(await plugin.POOL_ADDRESS_OFFSET());
      const proxyCode = await ethers.provider.getCode(await plugin.getAddress());
      const word = proxyCode.slice(2 + offset * 2, 2 + (offset + 32) * 2);

      expect(ethers.getAddress('0x' + word.slice(-40))).to.be.eq(await mockPool.getAddress());

      // The proxy also keeps it as a plain immutable, and pool() resolves to that getter, not the plugin's
      const proxy = await ethers.getContractAt('AlgebraPluginProxy', await plugin.getAddress());
      expect(await proxy.pool()).to.be.eq(await mockPool.getAddress());
    });
  });

  // plain tests for hooks functionality
  describe('#Hooks', () => {
    it('only pool can call hooks', async () => {
      await expect(plugin.beforeInitialize(wallet.address, 100)).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterInitialize(wallet.address, 100, 100)).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeModifyPosition(wallet.address, wallet.address, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterModifyPosition(wallet.address, wallet.address, 100, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeSwap(wallet.address, wallet.address, true, 100, 100, false, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterSwap(wallet.address, wallet.address, true, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.beforeFlash(wallet.address, wallet.address, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
      await expect(plugin.afterFlash(wallet.address, wallet.address, 100, 100, 100, 100, '0x')).to.be.revertedWithCustomError(plugin, 'OnlyPool');
    });

    it('every hook answers the pool with its own selector', async () => {
      // The real pool feeds each return value to Plugins.shouldReturn and reverts on a mismatch
      await mockPool.setPlugin(plugin);

      const fromPool = plugin.connect(await impersonateContract(mockPool)) as any;
      const selectorOf = (name: string) => plugin.interface.getFunction(name)!.selector;

      // The init hooks go first: afterInitialize seeds the oracle and refuses to run a second time
      expect(await fromPool.beforeInitialize.staticCall(wallet.address, 100)).to.be.eq(selectorOf('beforeInitialize'));
      expect(await fromPool.afterInitialize.staticCall(wallet.address, 100, 0)).to.be.eq(selectorOf('afterInitialize'));

      await initializeAtZeroTick(mockPool);

      const beforeModify = await fromPool.beforeModifyPosition.staticCall(wallet.address, wallet.address, -120, 120, 100, '0x');
      expect(beforeModify[0]).to.be.eq(selectorOf('beforeModifyPosition'));

      expect(await fromPool.afterModifyPosition.staticCall(wallet.address, wallet.address, -120, 120, 100, 0, 0, '0x')).to.be.eq(
        selectorOf('afterModifyPosition')
      );

      const beforeSwap = await fromPool.beforeSwap.staticCall(wallet.address, wallet.address, true, 0, 0, false, '0x');
      expect(beforeSwap[0]).to.be.eq(selectorOf('beforeSwap'));

      expect(await fromPool.afterSwap.staticCall(wallet.address, wallet.address, true, 0, 0, 0, 0, '0x')).to.be.eq(selectorOf('afterSwap'));
      expect(await fromPool.beforeFlash.staticCall(wallet.address, wallet.address, 1, 1, '0x')).to.be.eq(selectorOf('beforeFlash'));
      expect(await fromPool.afterFlash.staticCall(wallet.address, wallet.address, 1, 1, 0, 0, '0x')).to.be.eq(selectorOf('afterFlash'));
      expect(await fromPool.handlePluginFee.staticCall(0, 0)).to.be.eq(selectorOf('handlePluginFee'));
    });

    describe('not implemented hooks', async () => {
      let defaultConfig: bigint;

      beforeEach('connect plugin to pool', async () => {
        defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
      });

      // Note: beforeModifyPosition is used by Security plugin, so it keeps its config
      it('keeps config after beforeModifyPosition (used by Security)', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG);
      });

      it('resets config after afterModifyPosition', async () => {
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_POSITION_MODIFY_FLAG);
        await mockPool.mint(wallet.address, wallet.address, 0, 60, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });

      // Note: beforeFlash is used by Security plugin, so it keeps its config
      it('keeps config after beforeFlash (used by Security)', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.BEFORE_FLASH_FLAG);
      });

      it('resets config after afterFlash', async () => {
        await mockPool.setPluginConfig(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(PLUGIN_FLAGS.AFTER_FLASH_FLAG);
        await mockPool.flash(wallet.address, 100, 100, '0x');
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(defaultConfig);
      });
    });
  });

  describe('#FarmingPlugin', () => {
    describe('virtual pool tests', () => {
      let virtualPoolMock: MockTimeVirtualPool;

      beforeEach('deploy virtualPoolMock', async () => {
        await mockPluginFactory.setFarmingAddress(wallet);
        const virtualPoolMockFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        virtualPoolMock = (await virtualPoolMockFactory.deploy()) as any as MockTimeVirtualPool;
      });

      it('set incentive works', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
      });

      it('can detach incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('can detach incentive even if no more has rights to connect plugins', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot attach incentive even if no more has rights to connect plugins', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await expect(plugin.setIncentive(other)).to.be.revertedWith('Not allowed to set incentive');
      });

      it('new farming can detach old incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPluginFactory.setFarmingAddress(other);
        await plugin.connect(other).setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot detach incentive if nothing connected', async () => {
        await mockPool.setPlugin(plugin);
        await expect(plugin.setIncentive(ZeroAddress)).to.be.revertedWith('Already active');
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('cannot set same incentive twice', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Already active');
      });

      it('cannot set incentive if has active', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await expect(plugin.setIncentive(wallet.address)).to.be.revertedWith('Has active incentive');
      });

      it('can detach incentive if not connected to pool', async () => {
        const defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
        await mockPool.setPluginConfig(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        await mockPool.setPlugin(ZeroAddress);
        await plugin.setIncentive(ZeroAddress);
        expect(await plugin.incentive()).to.be.eq(ZeroAddress);
      });

      it('can set incentive if afterSwap hook is active', async () => {
        const defaultConfig = await plugin.defaultPluginConfig();
        await mockPool.setPlugin(plugin);
        await mockPool.setPluginConfig(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(BigInt(PLUGIN_FLAGS.AFTER_SWAP_FLAG) | defaultConfig);
      });

      it('set incentive works only for PluginFactory.farmingAddress', async () => {
        await mockPluginFactory.setFarmingAddress(ZeroAddress);
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Not allowed to set incentive');
      });

      it('incentive can not be attached if plugin is not attached', async () => {
        await expect(plugin.setIncentive(virtualPoolMock)).to.be.revertedWith('Plugin not attached');
      });

      it('incentive attached before initialization', async () => {
        await mockPool.setPlugin(plugin);

        await plugin.setIncentive(virtualPoolMock);
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await mockPool.mint(wallet.address, wallet.address, -120, 120, 1, '0x');
        await mockPool.mint(wallet.address, wallet.address, minTick, maxTick, 1, '0x');

        await mockPool.swapToTick(-130);

        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;

        const tick = (await mockPool.globalState()).tick;
        expect(await virtualPoolMock.currentTick()).to.be.eq(tick);
        expect(await virtualPoolMock.timestamp()).to.be.gt(0);
      });

      it('incentive attached after initialization', async () => {
        await mockPool.setPlugin(plugin);
        await mockPool.initialize(encodePriceSqrt(1, 1));
        await plugin.setIncentive(virtualPoolMock);

        await mockPool.mint(wallet.address, wallet.address, -120, 120, 1, '0x');
        await mockPool.mint(wallet.address, wallet.address, minTick, maxTick, 1, '0x');

        await mockPool.swapToTick(-130);

        expect(await plugin.incentive()).to.be.eq(await virtualPoolMock.getAddress());
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;

        const tick = (await mockPool.globalState()).tick;
        expect(await virtualPoolMock.currentTick()).to.be.eq(tick);
        expect(await virtualPoolMock.timestamp()).to.be.gt(0);
      });
    });

    describe('#isIncentiveConnected', () => {
      let virtualPoolMock: MockTimeVirtualPool;

      beforeEach('deploy virtualPoolMock', async () => {
        await mockPluginFactory.setFarmingAddress(wallet);
        const virtualPoolMockFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        virtualPoolMock = (await virtualPoolMockFactory.deploy()) as any as MockTimeVirtualPool;
      });

      it('true with active incentive', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.true;
      });

      it('false with invalid address', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        expect(await plugin.isIncentiveConnected.staticCall(wallet.address)).to.be.false;
      });

      it('false if plugin detached', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPool.setPlugin(ZeroAddress);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.false;
      });

      it('false if hook deactivated', async () => {
        await mockPool.setPlugin(plugin);
        await plugin.setIncentive(virtualPoolMock);
        await mockPool.setPluginConfig(0);
        expect(await plugin.isIncentiveConnected.staticCall(virtualPoolMock)).to.be.false;
      });
    });

    describe('#Incentive', () => {
      it('incentive is not detached after swap', async () => {
        await mockPool.setPlugin(plugin);
        await initializeAtZeroTick(mockPool);
        await mockPluginFactory.setFarmingAddress(wallet.address);

        const vpStubFactory = await ethers.getContractFactory('MockTimeVirtualPool');
        let vpStub = (await vpStubFactory.deploy()) as any as MockTimeVirtualPool;

        await plugin.setIncentive(vpStub);
        const initLiquidityAmount = 10000000000n;
        await mockPool.mint(wallet.address, wallet.address, -120, 120, initLiquidityAmount, '0x');
        await mockPool.mint(wallet.address, wallet.address, -1200, 1200, initLiquidityAmount, '0x');
        await mockPool.swapToTick(-200);

        expect(await plugin.incentive()).to.be.eq(await vpStub.getAddress());
      });
    });
  });

  describe('#ModuleIdentification', () => {
    beforeEach('connect plugin to pool', async () => {
      await mockPool.setPlugin(plugin);
    });


    describe('#getActiveModuleNames', () => {
      it('returns array with all module names', async () => {
        const moduleNames = await plugin.getActiveModuleNames();
        
        expect(moduleNames).to.be.an('array');
        expect(moduleNames.length).to.eq(5);
        
        // Check each module name is a non-empty string
        for (const moduleName of moduleNames) {
          expect(moduleName).to.be.a('string');
          expect(moduleName.length).to.be.gt(0);
        }
      });

      it('returns expected module names in correct order', async () => {
        const moduleNames = await plugin.getActiveModuleNames();

        // Verify all expected modules are present
        expect(moduleNames).to.include('Volatility Oracle Plugin');
        expect(moduleNames).to.include('Dynamic Fee Plugin');
        expect(moduleNames).to.include('Farming Proxy Plugin');
        expect(moduleNames).to.include('Security Plugin');
        expect(moduleNames).to.include('ALM Plugin');

        // Verify module count
        expect(moduleNames).to.have.lengthOf(5);
      });

    });

    describe('#defaultPluginConfig', () => {
      it('is exactly the union of the composed modules hook flags', async () => {
        // Dropping a module from the OR in defaultPluginConfig() has to fail here
        const expected =
          PLUGIN_FLAGS.BEFORE_SWAP_FLAG | // VolatilityOracle, DynamicFee, Security
          PLUGIN_FLAGS.AFTER_SWAP_FLAG | // FarmingProxy, ALM
          PLUGIN_FLAGS.BEFORE_POSITION_MODIFY_FLAG | // Security
          PLUGIN_FLAGS.BEFORE_FLASH_FLAG | // Security
          PLUGIN_FLAGS.AFTER_INIT_FLAG | // VolatilityOracle
          PLUGIN_FLAGS.DYNAMIC_FEE; // DynamicFee

        expect(await plugin.defaultPluginConfig()).to.be.eq(BigInt(expected));
      });

      it('is written into the pool by beforeInitialize', async () => {
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(0);
        await mockPool.initialize(encodePriceSqrt(1, 1));
        expect((await mockPool.globalState()).pluginConfig).to.be.eq(await plugin.defaultPluginConfig());
      });
    });
  });

  describe('#initialize', () => {
    // A fresh proxy off the same beacon, deployed outside the factory so it is still uninitialized
    async function deployUninitializedPlugin() {
      const proxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy = await proxyFactory.deploy(await mockPluginFactory.beacon(), await mockPool.getAddress(), '0x');

      const pluginContractFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
      return pluginContractFactory.attach(await proxy.getAddress()) as any as MockTimeAlgebraUpgradeablePlugin;
    }

    it('cannot be called a second time', async () => {
      await expect(plugin.initialize(DEFAULT_FEE_CONFIGURATION, ZeroAddress)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });

    it('cannot be called by anyone but the plugin factory', async () => {
      const uninitialized = await deployUninitializedPlugin();

      await expect(uninitialized.initialize(DEFAULT_FEE_CONFIGURATION, ZeroAddress)).to.be.revertedWithCustomError(
        uninitialized,
        'OnlyPluginFactory'
      );
    });

    it('emits PluginInitialized with the pool it is bound to', async () => {
      const uninitialized = await deployUninitializedPlugin();
      const pluginFactorySigner = await impersonateContract(mockPluginFactory);

      await expect(uninitialized.connect(pluginFactorySigner).initialize(DEFAULT_FEE_CONFIGURATION, ZeroAddress))
        .to.emit(uninitialized, 'PluginInitialized')
        .withArgs(await mockPool.getAddress());
    });
  });

  describe('#Authorization', () => {
    // Every one of these funnels through AlgebraUpgradeablePlugin._authorize()
    const guardedCalls: { name: string; call: (p: any) => Promise<any> }[] = [
      { name: 'changeFeeConfiguration', call: (p) => p.changeFeeConfiguration(DEFAULT_FEE_CONFIGURATION) },
      { name: 'setSecurityRegistry', call: (p) => p.setSecurityRegistry(ZeroAddress) },
      { name: 'setRebalanceManager', call: (p) => p.setRebalanceManager(ZeroAddress) },
      { name: 'setSlowTwapPeriod', call: (p) => p.setSlowTwapPeriod(3600) },
      // initializeALM rejects a zero manager on its own, so it needs a real address to reach _authorize's outcome
      { name: 'initializeALM', call: (p) => p.initializeALM(wallet.address, 3600, 600) },
    ];

    for (const { name, call } of guardedCalls) {
      it(`${name} is refused without the manager role`, async () => {
        await expect(call(plugin.connect(other))).to.be.revertedWithCustomError(plugin, 'OnlyAdministrator');
      });

      it(`${name} is accepted once ALGEBRA_BASE_PLUGIN_MANAGER is granted`, async () => {
        await mockFactory.grantRole(await plugin.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);
        await expect(call(plugin.connect(other))).to.not.be.reverted;
      });
    }

    it('the Algebra factory owner is authorized without an explicit role', async () => {
      expect(await mockFactory.owner()).to.be.eq(wallet.address);
      await expect(plugin.changeFeeConfiguration(DEFAULT_FEE_CONFIGURATION)).to.not.be.reverted;
    });
  });

  describe('#PluginFee', () => {
    let token: any;

    beforeEach('fund the plugin with a token', async () => {
      token = await (await ethers.getContractFactory('MockERC20')).deploy('Mock', 'MCK', 18);
      await token.mint(plugin, 1000);
    });

    it('collectPluginFee is refused without the manager role', async () => {
      await expect(plugin.connect(other).collectPluginFee(token, 400, other.address)).to.be.revertedWithCustomError(
        plugin,
        'OnlyAdministrator'
      );
    });

    it('collectPluginFee moves exactly the requested amount to the recipient', async () => {
      await plugin.collectPluginFee(token, 400, other.address);

      expect(await token.balanceOf(other.address)).to.be.eq(400);
      expect(await token.balanceOf(plugin)).to.be.eq(600);
    });

    // The matching positive case lives in #Hooks, which checks every hook selector in one place
    it('handlePluginFee can only be called by the pool', async () => {
      await expect(plugin.handlePluginFee(0, 0)).to.be.revertedWithCustomError(plugin, 'OnlyPool');
    });
  });

  describe('#SecurityRegistry status', () => {
    // Mirrors ISecurityRegistry.Status
    const BURN_ONLY = 1;
    const DISABLED = 2;

    let registry: any;

    beforeEach('attach a registry and open the pool', async () => {
      registry = await (await ethers.getContractFactory('MockSecurityRegistry')).deploy();
      await plugin.setSecurityRegistry(registry);
      await mockPool.setPlugin(plugin);
      await initializeAtZeroTick(mockPool);
    });

    it('lets every operation through while the pool is ENABLED', async () => {
      await expect(mockPool.swapToTick(10)).to.not.be.reverted;
      await expect(mockPool.flash(wallet.address, 1, 1, '0x')).to.not.be.reverted;
      await expect(mockPool.mint(wallet.address, wallet.address, -120, 120, 100, '0x')).to.not.be.reverted;
      await expect(mockPool.burn(-120, 120, 100, '0x')).to.not.be.reverted;
    });

    it('blocks swap, flash, mint and burn when the pool is DISABLED', async () => {
      await registry.setPoolStatus(mockPool, DISABLED);

      await expect(mockPool.swapToTick(10)).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
      await expect(mockPool.flash(wallet.address, 1, 1, '0x')).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
      await expect(mockPool.mint(wallet.address, wallet.address, -120, 120, 100, '0x')).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
      await expect(mockPool.burn(-120, 120, 100, '0x')).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
    });

    it('blocks swap, flash and mint but still allows a burn when the pool is BURN_ONLY', async () => {
      await registry.setPoolStatus(mockPool, BURN_ONLY);

      await expect(mockPool.swapToTick(10)).to.be.revertedWithCustomError(plugin, 'BurnOnly');
      await expect(mockPool.flash(wallet.address, 1, 1, '0x')).to.be.revertedWithCustomError(plugin, 'BurnOnly');
      await expect(mockPool.mint(wallet.address, wallet.address, -120, 120, 100, '0x')).to.be.revertedWithCustomError(plugin, 'BurnOnly');

      // This is the whole point of the split in beforeModifyPosition
      await expect(mockPool.burn(-120, 120, 100, '0x')).to.not.be.reverted;
    });

    it('a global status takes priority over an enabled pool', async () => {
      await registry.setPoolStatus(mockPool, 0);
      await registry.setGlobalStatus(DISABLED);

      await expect(mockPool.swapToTick(10)).to.be.revertedWithCustomError(plugin, 'PoolDisabled');
    });

    it('stops enforcing once the registry is detached', async () => {
      await registry.setPoolStatus(mockPool, DISABLED);
      await expect(mockPool.swapToTick(10)).to.be.revertedWithCustomError(plugin, 'PoolDisabled');

      await plugin.setSecurityRegistry(ZeroAddress);
      await expect(mockPool.swapToTick(10)).to.not.be.reverted;
    });
  });

  describe('#Dynamic fee reaching the pool', () => {
    beforeEach('connect and open the pool', async () => {
      await mockPool.setPlugin(plugin);
      await initializeAtZeroTick(mockPool);
    });

    it('beforeSwap hands the pool the same fee the plugin reports', async () => {
      await plugin.advanceTime(60);
      await mockPool.swapToTick(100);

      expect(await mockPool.overrideFee()).to.be.eq(await plugin.getCurrentFee());
    });

    it('collapses to baseFee once both sigmoids are switched off', async () => {
      await plugin.changeFeeConfiguration({ alpha1: 0, alpha2: 0, beta1: 0, beta2: 0, gamma1: 1, gamma2: 1, baseFee: 100 });

      await plugin.advanceTime(60);
      await mockPool.swapToTick(100);

      expect(await mockPool.overrideFee()).to.be.eq(100);
      expect(await plugin.getCurrentFee()).to.be.eq(100);
    });

    it('stays within the bound AdaptiveFee guarantees after real volatility', async () => {
      const feeConfig = await plugin.feeConfig();

      for (let i = 0; i < 8; i++) {
        await plugin.advanceTime(60);
        await mockPool.swapToTick(i % 2 === 0 ? 600 : -600);
      }

      const fee = await plugin.getCurrentFee();
      expect(fee).to.be.gte(feeConfig.baseFee);
      expect(fee).to.be.lte(feeConfig.baseFee + feeConfig.alpha1 + feeConfig.alpha2);
    });
  });

  describe('#ALM rebalance trigger', () => {
    const SLOW_PERIOD = 3600;
    const FAST_PERIOD = 600;
    // Start the oracle well away from zero so `currentTime - period` never underflows in canGetTwap
    const HISTORY_BASE = 100000;

    let rebalanceManager: any;

    beforeEach('deploy a rebalance manager and open the pool with history', async () => {
      rebalanceManager = await (await ethers.getContractFactory('MockRebalanceManager')).deploy();

      await mockPool.setPlugin(plugin);
      await plugin.advanceTime(HISTORY_BASE);
      await initializeAtZeroTick(mockPool);
    });

    it('leaves ALM uninitialized when the plugin is created', async () => {
      expect(await plugin.rebalanceManager()).to.be.eq(ZeroAddress);
      expect(await plugin.slowTwapPeriod()).to.be.eq(0);
      expect(await plugin.fastTwapPeriod()).to.be.eq(0);
    });

    it('does not rebalance while no manager is set', async () => {
      await plugin.advanceTime(2 * SLOW_PERIOD);
      await mockPool.swapToTick(100);

      expect(await rebalanceManager.rebalanceCount()).to.be.eq(0);
    });

    it('does not rebalance while the oracle holds less history than slowTwapPeriod', async () => {
      await plugin.initializeALM(rebalanceManager, SLOW_PERIOD, FAST_PERIOD);

      await plugin.advanceTime(SLOW_PERIOD / 2);
      await mockPool.swapToTick(100);

      expect(await rebalanceManager.rebalanceCount()).to.be.eq(0);
    });

    it('forwards the current and TWAP ticks once there is enough history', async () => {
      await plugin.initializeALM(rebalanceManager, SLOW_PERIOD, FAST_PERIOD);

      expect(await plugin.rebalanceManager()).to.be.eq(await rebalanceManager.getAddress());
      expect(await plugin.slowTwapPeriod()).to.be.eq(SLOW_PERIOD);
      expect(await plugin.fastTwapPeriod()).to.be.eq(FAST_PERIOD);

      await plugin.advanceTime(2 * SLOW_PERIOD);
      await mockPool.swapToTick(100);

      expect(await rebalanceManager.rebalanceCount()).to.be.eq(1);
      expect(await rebalanceManager.lastCurrentTick()).to.be.eq((await mockPool.globalState()).tick);
      expect(await rebalanceManager.lastTimestamp()).to.be.eq(await plugin.lastTimepointTimestamp());
    });

    it('stops rebalancing again once the manager is detached', async () => {
      await plugin.initializeALM(rebalanceManager, SLOW_PERIOD, FAST_PERIOD);
      await plugin.advanceTime(2 * SLOW_PERIOD);
      await mockPool.swapToTick(100);
      expect(await rebalanceManager.rebalanceCount()).to.be.eq(1);

      await plugin.setRebalanceManager(ZeroAddress);
      await plugin.advanceTime(SLOW_PERIOD);
      await mockPool.swapToTick(-100);

      expect(await rebalanceManager.rebalanceCount()).to.be.eq(1);
    });
  });
});
