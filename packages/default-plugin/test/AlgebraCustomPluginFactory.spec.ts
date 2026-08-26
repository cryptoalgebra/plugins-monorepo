import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from '@cryptoalgebra/test-utils/expect';
import { algebraCoreFixture } from '../../test-utils/externalFixtures';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const INIT_SQRT_PRICE = 2n ** 96n; // price 1.0

// Deploys the full Algebra core stack (factory + custom pool entry point with roles granted) and puts the
// AlgebraCustomPluginFactory behind a TransparentUpgradeableProxy, initialized against the real entry point.
async function customFactoryFixture() {
  const core = await algebraCoreFixture();
  const factoryAddr = await core.factory.getAddress();
  const entryPointAddr = await core.entryPoint.getAddress();

  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1];

  const ProxyAdmin = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdmin.connect(proxyAdminOwner).deploy();

  const CustomFactory = await ethers.getContractFactory('AlgebraCustomPluginFactory');
  const customFactoryImpl = await CustomFactory.deploy();

  const TransparentProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxy.deploy(await customFactoryImpl.getAddress(), await proxyAdmin.getAddress(), '0x');
  const proxyAddr = await proxy.getAddress();

  // Plugin module implementations shared by every proxy plugin.
  const volatilityOracleImpl = await (await ethers.getContractFactory('VolatilityOraclePluginImplementation')).deploy();
  const farmingProxyImpl = await (await ethers.getContractFactory('FarmingProxyPluginImplementation')).deploy();
  const securityImpl = await (await ethers.getContractFactory('SecurityPluginImplementation')).deploy();
  const priceConvergenceImpl = await (await ethers.getContractFactory('PriceConvergencePluginImplementation')).deploy();

  // The plugin implementation binds pluginFactory to the proxy address (known before initialize).
  const pluginImpl = await (await ethers.getContractFactory('AlgebraUpgradeablePlugin')).deploy(
    factoryAddr,
    proxyAddr,
    await volatilityOracleImpl.getAddress(),
    await farmingProxyImpl.getAddress(),
    await securityImpl.getAddress(),
    await priceConvergenceImpl.getAddress(),
    ZERO_ADDRESS
  );

  const customFactory = CustomFactory.attach(proxyAddr) as any;
  await customFactory.initialize(factoryAddr, entryPointAddr, await pluginImpl.getAddress());

  return { ...core, customFactory, customFactoryImpl, proxyAdmin, proxyAdminOwner };
}

describe('AlgebraCustomPluginFactory', () => {
  describe('#initialization', () => {
    it('wires algebraFactory, entryPoint and beacon', async () => {
      const f = await loadFixture(customFactoryFixture);
      expect(await f.customFactory.algebraFactory()).to.eq(await f.factory.getAddress());
      expect(await f.customFactory.entryPoint()).to.eq(await f.entryPoint.getAddress());
      expect(await f.customFactory.beacon()).to.not.eq(ZERO_ADDRESS);
      expect(await f.customFactory.implementation()).to.not.eq(ZERO_ADDRESS);
    });

    it('is deployed behind a proxy (impl != proxy)', async () => {
      const f = await loadFixture(customFactoryFixture);
      expect(await f.customFactory.getAddress()).to.not.eq(await f.customFactoryImpl.getAddress());
    });

    it('implementation cannot be initialized directly', async () => {
      const f = await loadFixture(customFactoryFixture);
      await expect(f.customFactoryImpl.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)).to.be.revertedWith(
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
      await expect(
        f.customFactory.afterCreatePoolHook(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(f.customFactory, 'OnlyEntryPoint');
    });
  });

  describe('#administration', () => {
    it('non administrator cannot set config', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [, other] = await ethers.getSigners();
      await expect(f.customFactory.connect(other).setFarmingAddress(other.address)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyAdministrator'
      );
      await expect(f.customFactory.connect(other).setSecurityRegistry(other.address)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyAdministrator'
      );
    });

    it('owner (administrator) can set farming and security', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner] = await ethers.getSigners();
      await expect(f.customFactory.setFarmingAddress(owner.address)).to.emit(f.customFactory, 'FarmingAddress');
      expect(await f.customFactory.farmingAddress()).to.eq(owner.address);
      await expect(f.customFactory.setSecurityRegistry(owner.address)).to.emit(f.customFactory, 'SecurityRegistry');
      expect(await f.customFactory.securityRegistry()).to.eq(owner.address);
    });
  });

  describe('#create', () => {
    it('creates, sets unit tick spacing and initializes the pool', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner] = await ethers.getSigners();
      const t0 = await f.token0.getAddress();
      const t1 = await f.token1.getAddress();

      const poolAddress = await f.customFactory.createCustomPoolAndInitialize.staticCall(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');

      await expect(f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x')).to.emit(f.customFactory, 'PluginCreated');

      const pluginAddress = await f.customFactory.pluginByPool(poolAddress);
      expect(pluginAddress).to.not.eq(ZERO_ADDRESS);

      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      expect(await pool.plugin()).to.eq(pluginAddress);
      expect(await pool.token0()).to.eq(t0);
      expect(await pool.token1()).to.eq(t1);

      // Unit tick spacing is applied and the pool is initialized with the supplied price.
      expect(await pool.tickSpacing()).to.eq(1);
      const [price] = await pool.globalState();
      expect(price).to.eq(INIT_SQRT_PRICE);
    });

    it('reverts when the plugin for a pool already exists', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner] = await ethers.getSigners();
      const t0 = await f.token0.getAddress();
      const t1 = await f.token1.getAddress();

      await f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
      await expect(f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x')).to.be.reverted;
    });
  });

  describe('#administration of a created pool', () => {
    it('administrator can retune a created pool through the entry point', async () => {
      const f = await loadFixture(customFactoryFixture);
      const [owner] = await ethers.getSigners();
      const t0 = await f.token0.getAddress();
      const t1 = await f.token1.getAddress();

      const poolAddress = await f.customFactory.createCustomPoolAndInitialize.staticCall(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
      await f.customFactory.createCustomPoolAndInitialize(owner.address, t0, t1, INIT_SQRT_PRICE, '0x');
      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);

      // Pool starts at unit tick spacing; the administrator can retune it via the factory -> entry point.
      expect(await pool.tickSpacing()).to.eq(1);
      await f.customFactory.setTickSpacing(poolAddress, 10);
      expect(await pool.tickSpacing()).to.eq(10);
    });
  });
});
