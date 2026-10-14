import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from '@cryptoalgebra/test-utils/expect';
import { algebraCoreFixture } from '@cryptoalgebra/test-utils/externalFixtures';
import { encodePriceSqrt, getMaxTick, getMinTick } from '@cryptoalgebra/test-utils/utilities';
import {
  abi as TEST_CALLEE_ABI,
  bytecode as TEST_CALLEE_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TestAlgebraCallee.sol/TestAlgebraCallee.json';
import { DEFAULT_FEE_CONFIGURATION, ZERO_ADDRESS } from './shared/fixtures';

const INIT_SQRT_PRICE = encodePriceSqrt(1, 1);
const DYNAMIC_FEE_FLAG = 128;

// Deploys the Algebra core stack (factory + custom pool entry point with roles granted) and puts the
// AlgebraCustomPluginFactory behind a TransparentUpgradeableProxy, initialized against the real entry point.
async function customFactoryFixture() {
  const core = await algebraCoreFixture();
  const factoryAddr = await core.factory.getAddress();
  const entryPointAddr = await core.entryPoint.getAddress();

  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1];

  const proxyAdmin = await (await ethers.getContractFactory('ProxyAdmin')).connect(proxyAdminOwner).deploy();

  const CustomFactory = await ethers.getContractFactory('AlgebraCustomPluginFactory');
  const customFactoryImpl = await CustomFactory.deploy();

  const TransparentProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxy.deploy(await customFactoryImpl.getAddress(), await proxyAdmin.getAddress(), '0x');
  const proxyAddr = await proxy.getAddress();

  // Plugin module implementations shared by every proxy plugin.
  const deploy = async (name: string) => (await (await ethers.getContractFactory(name)).deploy()).getAddress();

  // The plugin implementation binds pluginFactory to the proxy address (known before initialize).
  const pluginImpl = await (await ethers.getContractFactory('AlgebraUpgradeablePlugin')).deploy(
    factoryAddr,
    proxyAddr,
    await deploy('VolatilityOraclePluginImplementation'),
    await deploy('DynamicFeePluginImplementation'),
    await deploy('FarmingProxyPluginImplementation'),
    await deploy('AlmPluginImplementation'),
    await deploy('SecurityPluginImplementation'),
    await deploy('MevxPluginImplementation')
  );

  const customFactory = CustomFactory.attach(proxyAddr) as any;
  await customFactory.initialize(factoryAddr, entryPointAddr, await pluginImpl.getAddress(), DEFAULT_FEE_CONFIGURATION);

  const callee = (await (await ethers.getContractFactory(TEST_CALLEE_ABI, TEST_CALLEE_BYTECODE)).deploy()) as any;
  await core.token0.approve(await callee.getAddress(), ethers.MaxUint256);
  await core.token1.approve(await callee.getAddress(), ethers.MaxUint256);

  return { ...core, customFactory, customFactoryImpl, pluginImpl, proxyAdmin, callee };
}

async function createPoolFixture() {
  const f = await customFactoryFixture();
  const [owner] = await ethers.getSigners();
  const t0 = await f.token0.getAddress();
  const t1 = await f.token1.getAddress();

  const poolAddress = await f.customFactory.createCustomPoolAndInitialize.staticCall(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
  const createTx = f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
  await (await createTx).wait();

  const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
  const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', await f.customFactory.pluginByPool(poolAddress));

  return { ...f, owner, t0, t1, pool, plugin, createTx };
}

describe('AlgebraCustomPluginFactory', () => {
  describe('#initialization', () => {
    it('wires algebraFactory, entryPoint, beacon and fee config', async () => {
      const f = await loadFixture(customFactoryFixture);
      expect(await f.customFactory.algebraFactory()).to.eq(await f.factory.getAddress());
      expect(await f.customFactory.entryPoint()).to.eq(await f.entryPoint.getAddress());
      expect(await f.customFactory.beacon()).to.not.eq(ZERO_ADDRESS);
      expect(await f.customFactory.implementation()).to.eq(await f.pluginImpl.getAddress());

      const feeConfig = await f.customFactory.defaultFeeConfiguration();
      expect(feeConfig.baseFee).to.eq(DEFAULT_FEE_CONFIGURATION.baseFee);
      expect(feeConfig.alpha1).to.eq(DEFAULT_FEE_CONFIGURATION.alpha1);
    });

    it('implementation cannot be initialized directly', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(f.customFactoryImpl.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, DEFAULT_FEE_CONFIGURATION)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });

    it('proxy cannot be initialized twice', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(f.customFactory.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, DEFAULT_FEE_CONFIGURATION)).to.be.revertedWith(
        'Initializable: contract is already initialized'
      );
    });
  });

  describe('#hooks are entry-point only', () => {
    it('beforeCreatePoolHook reverts for non entry point', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(
        f.customFactory.beforeCreatePoolHook(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')
      ).to.be.revertedWithCustomError(f.customFactory, 'OnlyEntryPoint');
    });

    it('afterCreatePoolHook reverts for non entry point', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(f.customFactory.afterCreatePoolHook(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyEntryPoint'
      );
    });
  });

  describe('#administration', () => {
    it('non administrator cannot change settings', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [, other] = await ethers.getSigners();
      const c = f.customFactory.connect(other);
      const err = 'OnlyAdministrator';

      await expect(c.setFarmingAddress(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setSecurityRegistry(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setDefaultFeeConfiguration(DEFAULT_FEE_CONFIGURATION)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setMevxRouter(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setMevxExecutor(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setProfitDistributor(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setConfigId(ethers.ZeroHash)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.upgradePlugins(other.address)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setTickSpacing(ZERO_ADDRESS, 10)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setPlugin(ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setPluginConfig(ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(f.customFactory, err);
      await expect(c.setFee(ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(f.customFactory, err);
    });

    it('administrator can change settings', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner, other] = await ethers.getSigners();
      const configId = ethers.id('config');

      await expect(f.customFactory.setFarmingAddress(owner.address)).to.emit(f.customFactory, 'FarmingAddress');
      await expect(f.customFactory.setFarmingAddress(owner.address)).to.be.revertedWithCustomError(f.customFactory, 'FarmingAddressUnchanged');
      await expect(f.customFactory.setSecurityRegistry(other.address)).to.emit(f.customFactory, 'SecurityRegistry');
      await expect(f.customFactory.setMevxRouter(other.address)).to.emit(f.customFactory, 'DefaultMevxRouter');
      await expect(f.customFactory.setMevxExecutor(other.address)).to.emit(f.customFactory, 'DefaultMevxExecutor');
      await expect(f.customFactory.setProfitDistributor(other.address)).to.emit(f.customFactory, 'DefaultProfitDistributor');
      await expect(f.customFactory.setConfigId(configId)).to.emit(f.customFactory, 'DefaultConfigId');
      await expect(f.customFactory.setDefaultFeeConfiguration({ ...DEFAULT_FEE_CONFIGURATION, baseFee: 500 })).to.emit(
        f.customFactory,
        'DefaultFeeConfiguration'
      );

      expect(await f.customFactory.farmingAddress()).to.eq(owner.address);
      expect(await f.customFactory.securityRegistry()).to.eq(other.address);
      expect(await f.customFactory.defaultMevxRouter()).to.eq(other.address);
      expect(await f.customFactory.defaultMevxExecutor()).to.eq(other.address);
      expect(await f.customFactory.defaultProfitDistributor()).to.eq(other.address);
      expect(await f.customFactory.defaultConfigId()).to.eq(configId);
      expect((await f.customFactory.defaultFeeConfiguration()).baseFee).to.eq(500);
    });

    it('rejects invalid fee configuration', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(f.customFactory.setDefaultFeeConfiguration({ ...DEFAULT_FEE_CONFIGURATION, gamma1: 0 })).to.be.reverted;
    });
  });

  describe('#createCustomPoolAndInitialize', () => {
    it('creates the pool with a plugin and initializes it', async () => {
      const f = await loadFixture(createPoolFixture);

      await expect(f.createTx).to.emit(f.customFactory, 'PluginCreated').withArgs(await f.pool.getAddress(), await f.plugin.getAddress());
      expect(await f.factory.customPoolByPair(await f.customFactory.getAddress(), f.t0, f.t1)).to.eq(await f.pool.getAddress());

      expect(await f.pool.plugin()).to.eq(await f.plugin.getAddress());
      expect(await f.plugin.pool()).to.eq(await f.pool.getAddress());
      expect(await f.pool.token0()).to.eq(f.t0);
      expect(await f.pool.token1()).to.eq(f.t1);

      const [price] = await f.pool.globalState();
      expect(price).to.eq(INIT_SQRT_PRICE);
      expect(await f.plugin.isInitialized()).to.eq(true);
    });

    it('sets the default plugin config with dynamic fee enabled', async () => {
      const f = await loadFixture(createPoolFixture);

      const [, , , pluginConfig] = await f.pool.globalState();
      expect(pluginConfig).to.eq(await f.plugin.defaultPluginConfig());
      expect(pluginConfig & BigInt(DYNAMIC_FEE_FLAG)).to.eq(BigInt(DYNAMIC_FEE_FLAG));

      // with dynamic fee enabled the pool reports the plugin fee
      expect(await f.pool.fee()).to.eq(await f.plugin.getCurrentFee());
    });

    it('initializes the plugin with factory defaults', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner, other] = await ethers.getSigners();
      const configId = ethers.id('config');

      await f.customFactory.setSecurityRegistry(other.address);
      await f.customFactory.setMevxRouter(other.address);
      await f.customFactory.setMevxExecutor(owner.address);
      await f.customFactory.setProfitDistributor(other.address);
      await f.customFactory.setConfigId(configId);
      await f.customFactory.setDefaultFeeConfiguration({ ...DEFAULT_FEE_CONFIGURATION, baseFee: 500 });

      const t0 = await f.token0.getAddress();
      const t1 = await f.token1.getAddress();
      const poolAddress = await f.customFactory.createCustomPoolAndInitialize.staticCall(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
      await f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
      const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', await f.customFactory.pluginByPool(poolAddress));

      expect(await plugin.getSecurityRegistry()).to.eq(other.address);
      expect(await plugin.getMevxRouter()).to.eq(other.address);
      expect(await plugin.getMevxExecutor()).to.eq(owner.address);
      expect(await plugin.getProfitDistributor()).to.eq(other.address);
      expect(await plugin.getConfigId()).to.eq(configId);
      expect((await plugin.feeConfig()).baseFee).to.eq(500);
    });

    it('reverts when the pool already exists', async () => {
      const f = await loadFixture(createPoolFixture);
      await expect(f.customFactory.createCustomPoolAndInitialize(f.owner.address, f.t0, f.t1, INIT_SQRT_PRICE, '0x')).to.be.reverted;
    });

    it('swaps are charged with the dynamic fee', async () => {
      const f = await loadFixture(createPoolFixture);
      const poolAddress = await f.pool.getAddress();
      const tickSpacing = Number(await f.pool.tickSpacing());

      await f.callee.mint(poolAddress, f.owner.address, getMinTick(tickSpacing), getMaxTick(tickSpacing), 10n ** 18n);

      const currentFee = await f.plugin.getCurrentFee();
      expect(currentFee).to.not.eq(0);

      await expect(f.callee.swapExact0For1(poolAddress, 10n ** 15n, f.owner.address, 4295128740n))
        .to.emit(f.pool, 'SwapFee')
        .withArgs(await f.callee.getAddress(), currentFee, 0);
    });
  });

  describe('#administration of a created pool', () => {
    it('administrator can retune tick spacing through the entry point', async () => {
      const f = await loadFixture(createPoolFixture);
      await f.customFactory.setTickSpacing(await f.pool.getAddress(), 10);
      expect(await f.pool.tickSpacing()).to.eq(10);
    });

    it('administrator can change the plugin config through the entry point', async () => {
      const f = await loadFixture(createPoolFixture);
      await f.customFactory.setPluginConfig(await f.pool.getAddress(), 0);
      const [, , , pluginConfig] = await f.pool.globalState();
      expect(pluginConfig).to.eq(0);
    });

    it('static fee cannot be changed while dynamic fee is active', async () => {
      const f = await loadFixture(createPoolFixture);
      await expect(f.customFactory.setFee(await f.pool.getAddress(), 100)).to.be.reverted;
    });
  });
});
