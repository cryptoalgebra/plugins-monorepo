import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getCreateAddress } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

import ALGEBRA_FACTORY from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraFactory.sol/AlgebraFactory.json';
import POOL_DEPLOYER from '@cryptoalgebra/integral-core/artifacts/contracts/AlgebraPoolDeployer.sol/AlgebraPoolDeployer.json';
import ENTRY_POINT from '@cryptoalgebra/integral-periphery/artifacts/contracts/AlgebraCustomPoolEntryPoint.sol/AlgebraCustomPoolEntryPoint.json';
import { tokensFixture } from 'test-utils/externalFixtures';

import {
  ZERO_ADDRESS,
  DEFAULT_FEE_CONFIGURATION,
  EMPTY_IMPLEMENTATIONS,
  deployImplementations,
  deployTransparentProxy,
  impersonateContract,
  moduleArgs,
} from './shared/fixtures';
import { pinnedCustomPluginFactory } from './shared/pinnedFactory';

const ADMINISTRATOR_ROLE = ethers.id('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

// erc7201:algebra.custompluginfactory.storage, derived here rather than copied from the contract
function erc7201(namespace: string): bigint {
  const inner = BigInt(ethers.keccak256(ethers.toUtf8Bytes(namespace))) - 1n;
  return BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [inner]))) & ~0xffn;
}

const OTHER_FEE_CONFIGURATION = {
  alpha1: 3002,
  alpha2: 10009,
  beta1: 1001,
  beta2: 1006,
  gamma1: 20,
  gamma2: 22,
  baseFee: 150,
};

const INVALID_FEE_CONFIGURATIONS = [
  { name: 'a maximum fee above uint16', config: { ...DEFAULT_FEE_CONFIGURATION, alpha1: 30000, alpha2: 30000, baseFee: 15000 }, reason: 'Max fee exceeded' },
  { name: 'a zero gamma1', config: { ...DEFAULT_FEE_CONFIGURATION, gamma1: 0 }, reason: 'Gammas must be > 0' },
  { name: 'a zero gamma2', config: { ...DEFAULT_FEE_CONFIGURATION, gamma2: 0 }, reason: 'Gammas must be > 0' },
];

describe('AlgebraCustomPluginFactory', function () {
  // Real Integral 1.3 core and custom pool entry point, so the hook arguments and role checks are the production ones
  async function deployCore() {
    const [wallet] = await ethers.getSigners();
    const { token0, token1 } = await tokensFixture();

    // The factory takes the pool deployer address, and the deployer is the next deployment
    const poolDeployerAddress = getCreateAddress({
      from: wallet.address,
      nonce: (await ethers.provider.getTransactionCount(wallet.address)) + 1,
    });

    const algebraFactory = (await (await ethers.getContractFactory(ALGEBRA_FACTORY.abi, ALGEBRA_FACTORY.bytecode)).deploy(poolDeployerAddress)) as any;
    // 1.3 pools delegate initialize and the setters to the extension the factory deploys
    const poolDeployer = await (await ethers.getContractFactory(POOL_DEPLOYER.abi, POOL_DEPLOYER.bytecode)).deploy(
      algebraFactory,
      await algebraFactory.poolExtension()
    );
    if ((await poolDeployer.getAddress()) !== poolDeployerAddress) throw new Error('pool deployer address mismatch');

    const entryPoint = (await (await ethers.getContractFactory(ENTRY_POINT.abi, ENTRY_POINT.bytecode)).deploy(algebraFactory)) as any;
    await algebraFactory.grantRole(await algebraFactory.CUSTOM_POOL_DEPLOYER(), entryPoint);
    await algebraFactory.grantRole(await algebraFactory.POOLS_ADMINISTRATOR_ROLE(), entryPoint);

    return { algebraFactory, entryPoint, token0, token1 };
  }

  async function deployWith(contractFactory: any) {
    const core = await deployCore();
    const signers = await ethers.getSigners();
    const [wallet, other] = signers;
    const proxyAdminOwner = signers[signers.length - 1];

    const factoryImpl = await contractFactory.deploy();
    const { proxyAddress, proxyAdmin } = await deployTransparentProxy(await factoryImpl.getAddress(), proxyAdminOwner);

    // The plugin implementation binds pluginFactory to the proxy, so it comes after the proxy and before initialize
    const implementations = await deployImplementations();
    const pluginImpl = await (await ethers.getContractFactory('AlgebraUpgradeablePlugin')).deploy(
      core.algebraFactory,
      proxyAddress,
      ...moduleArgs(implementations)
    );

    const customFactory = contractFactory.attach(proxyAddress) as any;
    await customFactory.initialize(core.entryPoint, pluginImpl, DEFAULT_FEE_CONFIGURATION);

    return { ...core, customFactory, factoryImpl, pluginImpl, implementations, proxyAdmin, proxyAdminOwner, wallet, other };
  }

  async function deployFixture() {
    return deployWith(await ethers.getContractFactory('AlgebraCustomPluginFactory'));
  }

  // The plugin proxy's pool offset only holds at production settings, see shared/pinnedFactory.ts
  async function deployPinnedFixture() {
    return deployWith(await pinnedCustomPluginFactory());
  }

  type Deployment = Awaited<ReturnType<typeof deployFixture>>;

  async function createCustomPool(f: Deployment, caller = f.wallet) {
    const args = [caller.address, f.token0, f.token1, '0x'] as const;
    const poolAddress: string = await f.customFactory.connect(caller).createCustomPool.staticCall(...args);
    await f.customFactory.connect(caller).createCustomPool(...args);

    const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
    const plugin = await ethers.getContractAt('AlgebraUpgradeablePlugin', await f.customFactory.pluginByPool(poolAddress));
    return { pool, poolAddress, plugin };
  }

  // A plugin proxy is the factory's next CREATE
  async function nextPluginAddress(f: Deployment) {
    const from = await f.customFactory.getAddress();
    return getCreateAddress({ from, nonce: await ethers.provider.getTransactionCount(from) });
  }

  describe('Deployment', function () {
    it('should take the Algebra factory from the entry point', async function () {
      const f = await loadFixture(deployFixture);

      expect(await f.customFactory.entryPoint()).to.equal(await f.entryPoint.getAddress());
      expect(await f.customFactory.algebraFactory()).to.equal(await f.algebraFactory.getAddress());
    });

    it('should point a beacon it owns at the plugin implementation', async function () {
      const f = await loadFixture(deployFixture);
      const beacon = await ethers.getContractAt('UpgradeableBeacon', await f.customFactory.beacon());

      expect(await f.customFactory.implementation()).to.equal(await f.pluginImpl.getAddress());
      expect(await beacon.implementation()).to.equal(await f.pluginImpl.getAddress());
      expect(await beacon.owner()).to.equal(await f.customFactory.getAddress());
    });

    it('should store the default fee configuration', async function () {
      const f = await loadFixture(deployFixture);

      expect(await f.customFactory.defaultFeeConfiguration()).to.deep.equal(Object.values(DEFAULT_FEE_CONFIGURATION).map(BigInt));
    });

    it('should keep its state in the erc7201:algebra.custompluginfactory.storage slot', async function () {
      const f = await loadFixture(deployFixture);
      const proxy = await f.customFactory.getAddress();
      const slot = erc7201('erc7201:algebra.custompluginfactory.storage');

      const word = async (offset: bigint) => ethers.getAddress(ethers.dataSlice(await ethers.provider.getStorage(proxy, slot + offset), 12));
      expect(await word(0n)).to.equal(await f.algebraFactory.getAddress());
      expect(await word(1n)).to.equal(await f.entryPoint.getAddress());
      expect(await word(2n)).to.equal(await f.customFactory.beacon());
    });

    it('should refuse a second initialize', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.initialize(f.entryPoint, f.pluginImpl, DEFAULT_FEE_CONFIGURATION)).to.be.revertedWithCustomError(
        f.customFactory,
        'InvalidInitialization'
      );
    });

    it('should refuse to initialize the implementation itself', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.factoryImpl.initialize(f.entryPoint, f.pluginImpl, DEFAULT_FEE_CONFIGURATION)).to.be.revertedWithCustomError(
        f.factoryImpl,
        'InvalidInitialization'
      );
    });

    describe('with a fresh proxy', function () {
      async function deployUninitialized(f: Deployment) {
        const implFactory = await ethers.getContractFactory('AlgebraCustomPluginFactory');
        const { proxyAddress } = await deployTransparentProxy(await f.factoryImpl.getAddress(), f.proxyAdminOwner);
        return implFactory.attach(proxyAddress) as any;
      }

      it('should emit the initial fee configuration', async function () {
        const f = await loadFixture(deployFixture);
        const fresh = await deployUninitialized(f);

        await expect(fresh.initialize(f.entryPoint, f.pluginImpl, DEFAULT_FEE_CONFIGURATION))
          .to.emit(fresh, 'DefaultFeeConfiguration')
          .withArgs(Object.values(DEFAULT_FEE_CONFIGURATION));
      });

      // deployCustomFactory.ts configures the factory in this state and moves the beacon last
      it('should refuse to create a pool while the beacon still points at the factory implementation', async function () {
        const f = await loadFixture(deployFixture);
        const fresh = await deployUninitialized(f);
        await fresh.initialize(f.entryPoint, f.factoryImpl, DEFAULT_FEE_CONFIGURATION);

        await expect(fresh.createCustomPool(f.wallet.address, f.token0, f.token1, '0x')).to.be.revertedWithoutReason();

        // pluginFactory is an immutable, so this proxy needs a plugin implementation of its own
        const pluginImpl = await (await ethers.getContractFactory('AlgebraUpgradeablePlugin')).deploy(
          f.algebraFactory,
          fresh,
          ...moduleArgs(f.implementations)
        );
        await fresh.upgradePlugins(pluginImpl);
        await expect(fresh.createCustomPool(f.wallet.address, f.token0, f.token1, '0x')).to.emit(fresh, 'PluginCreated');
      });

      for (const { name, config, reason } of INVALID_FEE_CONFIGURATIONS) {
        it(`should reject an initial fee configuration with ${name}`, async function () {
          const f = await loadFixture(deployFixture);
          const fresh = await deployUninitialized(f);

          await expect(fresh.initialize(f.entryPoint, f.pluginImpl, config)).to.be.revertedWith(reason);
        });
      }
    });
  });

  describe('Custom pool creation', function () {
    it('should create a custom pool wired to a new plugin', async function () {
      const f = await loadFixture(deployFixture);
      const t0 = await f.token0.getAddress();
      const t1 = await f.token1.getAddress();

      const expectedPlugin = await nextPluginAddress(f);
      const poolAddress = await f.customFactory.createCustomPool.staticCall(f.wallet.address, t0, t1, '0x');
      await expect(f.customFactory.createCustomPool(f.wallet.address, t0, t1, '0x'))
        .to.emit(f.customFactory, 'PluginCreated')
        .withArgs(poolAddress, expectedPlugin);

      const pool = await ethers.getContractAt('IAlgebraPool', poolAddress);
      expect(await pool.plugin()).to.equal(expectedPlugin);
      expect(await f.customFactory.pluginByPool(poolAddress)).to.equal(expectedPlugin);
      expect(await f.algebraFactory.customPoolByPair(await f.customFactory.getAddress(), t0, t1)).to.equal(poolAddress);
    });

    it('should hand the plugin its pool, the Algebra factory and this factory', async function () {
      const f = await loadFixture(deployFixture);
      const { plugin, poolAddress } = await createCustomPool(f);

      expect(await plugin.pool()).to.equal(poolAddress);
      expect(await plugin.factory()).to.equal(await f.algebraFactory.getAddress());
      expect(await plugin.pluginFactory()).to.equal(await f.customFactory.getAddress());
    });

    it('should initialize the plugin with the configuration current at creation', async function () {
      const f = await loadFixture(deployFixture);
      await f.customFactory.setDefaultFeeConfiguration(OTHER_FEE_CONFIGURATION);
      await f.customFactory.setSecurityRegistry(f.other.address);

      const { plugin } = await createCustomPool(f);

      expect(await plugin.feeConfig()).to.deep.equal(Object.values(OTHER_FEE_CONFIGURATION).map(BigInt));
      expect(await plugin.getSecurityRegistry()).to.equal(f.other.address);
    });

    it('should let any caller create a custom pool', async function () {
      const f = await loadFixture(deployFixture);
      const { pool } = await createCustomPool(f, f.other);

      expect(await pool.plugin()).to.not.equal(ZERO_ADDRESS);
    });

    it('should not create a second custom pool for the same pair', async function () {
      const f = await loadFixture(deployFixture);
      await createCustomPool(f);

      await expect(f.customFactory.createCustomPool(f.wallet.address, f.token1, f.token0, '0x')).to.be.revertedWithoutReason();
    });
  });

  describe('Pool creation hooks', function () {
    it('should reject beforeCreatePoolHook from the Algebra factory', async function () {
      const f = await loadFixture(deployFixture);
      const algebraFactorySigner = await impersonateContract(f.algebraFactory);

      await expect(
        f.customFactory
          .connect(algebraFactorySigner)
          .beforeCreatePoolHook(f.other.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')
      ).to.be.revertedWithCustomError(f.customFactory, 'OnlyEntryPoint');
    });

    it('should reject beforeCreatePoolHook from an account', async function () {
      const f = await loadFixture(deployFixture);

      await expect(
        f.customFactory.beforeCreatePoolHook(f.other.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')
      ).to.be.revertedWithCustomError(f.customFactory, 'OnlyEntryPoint');
    });

    it('should create a plugin when the entry point calls beforeCreatePoolHook', async function () {
      const f = await loadFixture(deployFixture);
      const entryPointSigner = await impersonateContract(f.entryPoint);
      const expectedPlugin = await nextPluginAddress(f);

      await expect(
        f.customFactory
          .connect(entryPointSigner)
          .beforeCreatePoolHook(f.other.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x')
      )
        .to.emit(f.customFactory, 'PluginCreated')
        .withArgs(f.other.address, expectedPlugin);
      expect(await f.customFactory.pluginByPool(f.other.address)).to.equal(expectedPlugin);
    });

    it('should refuse a second plugin for the same pool', async function () {
      const f = await loadFixture(deployFixture);
      const entryPointSigner = await impersonateContract(f.entryPoint);
      const hook = () =>
        f.customFactory
          .connect(entryPointSigner)
          .beforeCreatePoolHook(f.other.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');

      await hook();
      await expect(hook()).to.be.revertedWithCustomError(f.customFactory, 'PluginAlreadyCreated');
    });

    it('should reject afterCreatePoolHook from anyone but the entry point', async function () {
      const f = await loadFixture(deployFixture);
      const algebraFactorySigner = await impersonateContract(f.algebraFactory);

      await expect(f.customFactory.afterCreatePoolHook(f.other.address, f.other.address, ZERO_ADDRESS)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyEntryPoint'
      );
      await expect(
        f.customFactory.connect(algebraFactorySigner).afterCreatePoolHook(f.other.address, f.other.address, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(f.customFactory, 'OnlyEntryPoint');
    });

    it('should accept afterCreatePoolHook from the entry point', async function () {
      const f = await loadFixture(deployFixture);
      const entryPointSigner = await impersonateContract(f.entryPoint);

      await expect(f.customFactory.connect(entryPointSigner).afterCreatePoolHook(f.other.address, f.other.address, ZERO_ADDRESS)).to.not.be
        .reverted;
    });
  });

  describe('Custom pool management', function () {
    // Each value differs from what a fresh custom pool starts with, so a call that does nothing fails
    const OPERATIONS = [
      { method: 'setTickSpacing', value: 10, read: async (pool: any) => pool.tickSpacing() },
      { method: 'setFee', value: 1234, read: async (pool: any) => (await pool.globalState()).lastFee },
      { method: 'setPluginConfig', value: 1, read: async (pool: any) => (await pool.globalState()).pluginConfig },
      { method: 'setPlugin', value: '0x000000000000000000000000000000000000dEaD', read: async (pool: any) => pool.plugin() },
    ];

    for (const { method, value, read } of OPERATIONS) {
      it(`should reject ${method} from a caller without the role`, async function () {
        const f = await loadFixture(deployFixture);
        const { poolAddress } = await createCustomPool(f);

        await expect(f.customFactory.connect(f.other)[method](poolAddress, value)).to.be.revertedWithCustomError(
          f.customFactory,
          'OnlyAdministrator'
        );
      });

      it(`should forward ${method} from the Algebra factory owner to the pool`, async function () {
        const f = await loadFixture(deployFixture);
        const { pool, poolAddress } = await createCustomPool(f);
        expect(await read(pool)).to.not.equal(value);

        await f.customFactory[method](poolAddress, value);

        expect(await read(pool)).to.equal(value);
      });

      it(`should forward ${method} from an ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR to the pool`, async function () {
        const f = await loadFixture(deployFixture);
        const { pool, poolAddress } = await createCustomPool(f);
        await f.algebraFactory.grantRole(ADMINISTRATOR_ROLE, f.other.address);

        await f.customFactory.connect(f.other)[method](poolAddress, value);

        expect(await read(pool)).to.equal(value);
      });
    }
  });

  describe('Configuration', function () {
    it('should reject setDefaultFeeConfiguration from a caller without the role', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.connect(f.other).setDefaultFeeConfiguration(OTHER_FEE_CONFIGURATION)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyAdministrator'
      );
    });

    it('should update the default fee configuration and emit it', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.setDefaultFeeConfiguration(OTHER_FEE_CONFIGURATION))
        .to.emit(f.customFactory, 'DefaultFeeConfiguration')
        .withArgs(Object.values(OTHER_FEE_CONFIGURATION));
      expect(await f.customFactory.defaultFeeConfiguration()).to.deep.equal(Object.values(OTHER_FEE_CONFIGURATION).map(BigInt));
    });

    for (const { name, config, reason } of INVALID_FEE_CONFIGURATIONS) {
      it(`should reject a default fee configuration with ${name}`, async function () {
        const f = await loadFixture(deployFixture);

        await expect(f.customFactory.setDefaultFeeConfiguration(config)).to.be.revertedWith(reason);
      });
    }

    it('should reject setFarmingAddress from a caller without the role', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.connect(f.other).setFarmingAddress(f.other.address)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyAdministrator'
      );
    });

    it('should update the farming address and emit it', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.setFarmingAddress(f.other.address)).to.emit(f.customFactory, 'FarmingAddress').withArgs(f.other.address);
      expect(await f.customFactory.farmingAddress()).to.equal(f.other.address);
    });

    it('should refuse to set the farming address it already has', async function () {
      const f = await loadFixture(deployFixture);
      await f.customFactory.setFarmingAddress(f.other.address);

      await expect(f.customFactory.setFarmingAddress(f.other.address)).to.be.revertedWithCustomError(f.customFactory, 'FarmingAddressUnchanged');
    });

    it('should reject setSecurityRegistry from a caller without the role', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.connect(f.other).setSecurityRegistry(f.other.address)).to.be.revertedWithCustomError(
        f.customFactory,
        'OnlyAdministrator'
      );
    });

    it('should update the security registry and emit it', async function () {
      const f = await loadFixture(deployFixture);

      await expect(f.customFactory.setSecurityRegistry(f.other.address))
        .to.emit(f.customFactory, 'SecurityRegistry')
        .withArgs(f.other.address);
      expect(await f.customFactory.securityRegistry()).to.equal(f.other.address);
    });

    it('should accept configuration from an ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR', async function () {
      const f = await loadFixture(deployFixture);
      await f.algebraFactory.grantRole(ADMINISTRATOR_ROLE, f.other.address);

      await f.customFactory.connect(f.other).setFarmingAddress(f.other.address);

      expect(await f.customFactory.farmingAddress()).to.equal(f.other.address);
    });
  });

  describe('Plugin upgrades', function () {
    async function deployUpgradedPlugin(f: Deployment) {
      const factory = await ethers.getContractFactory('MockUpgradedPlugin');
      return factory.deploy(f.algebraFactory, f.customFactory, EMPTY_IMPLEMENTATIONS);
    }

    it('should reject upgradePlugins from a caller without the role', async function () {
      const f = await loadFixture(deployFixture);
      const newImpl = await deployUpgradedPlugin(f);

      await expect(f.customFactory.connect(f.other).upgradePlugins(newImpl)).to.be.revertedWithCustomError(f.customFactory, 'OnlyAdministrator');
    });

    it('should not let the Algebra factory owner upgrade the beacon directly', async function () {
      const f = await loadFixture(deployFixture);
      const beacon = await ethers.getContractAt('UpgradeableBeacon', await f.customFactory.beacon());
      const newImpl = await deployUpgradedPlugin(f);

      await expect(beacon.upgradeTo(newImpl)).to.be.revertedWithCustomError(beacon, 'OwnableUnauthorizedAccount').withArgs(f.wallet.address);
    });

    it('should move plugins that already exist to the new implementation', async function () {
      const f = await loadFixture(deployFixture);
      const { plugin } = await createCustomPool(f);
      const newImpl = await deployUpgradedPlugin(f);

      await f.customFactory.upgradePlugins(newImpl);

      expect(await f.customFactory.implementation()).to.equal(await newImpl.getAddress());
      const upgraded = await ethers.getContractAt('MockUpgradedPlugin', await plugin.getAddress());
      expect(await upgraded.isUpgraded()).to.be.true;
    });
  });

  describe('Factory upgrades', function () {
    it('should keep every stored field across a factory upgrade', async function () {
      const f = await loadFixture(deployFixture);
      const { poolAddress, plugin } = await createCustomPool(f);
      await f.customFactory.setDefaultFeeConfiguration(OTHER_FEE_CONFIGURATION);
      await f.customFactory.setFarmingAddress(f.other.address);
      await f.customFactory.setSecurityRegistry(f.wallet.address);
      const beacon = await f.customFactory.beacon();

      const newImpl = await (await ethers.getContractFactory('AlgebraCustomPluginFactory')).deploy();
      await f.proxyAdmin.connect(f.proxyAdminOwner).upgradeAndCall(f.customFactory, newImpl, '0x');

      expect(await f.customFactory.algebraFactory()).to.equal(await f.algebraFactory.getAddress());
      expect(await f.customFactory.entryPoint()).to.equal(await f.entryPoint.getAddress());
      expect(await f.customFactory.beacon()).to.equal(beacon);
      expect(await f.customFactory.pluginByPool(poolAddress)).to.equal(await plugin.getAddress());
      expect(await f.customFactory.defaultFeeConfiguration()).to.deep.equal(Object.values(OTHER_FEE_CONFIGURATION).map(BigInt));
      expect(await f.customFactory.farmingAddress()).to.equal(f.other.address);
      expect(await f.customFactory.securityRegistry()).to.equal(f.wallet.address);
    });

    it('should reject a factory upgrade from anyone but the ProxyAdmin owner', async function () {
      const f = await loadFixture(deployFixture);
      const newImpl = await (await ethers.getContractFactory('AlgebraCustomPluginFactory')).deploy();

      await expect(f.proxyAdmin.connect(f.wallet).upgradeAndCall(f.customFactory, newImpl, '0x'))
        .to.be.revertedWithCustomError(f.proxyAdmin, 'OwnableUnauthorizedAccount')
        .withArgs(f.wallet.address);
    });
  });

  describe('Plugin on a custom pool', function () {
    it('should write its config into the pool and seed the oracle when the pool is initialized', async function () {
      const f = await loadFixture(deployPinnedFixture);
      const { pool, plugin } = await createCustomPool(f);
      expect(await plugin.isInitialized()).to.be.false;

      await pool.initialize(2n ** 96n);

      expect((await pool.globalState()).pluginConfig).to.equal(await plugin.defaultPluginConfig());
      expect(await plugin.isInitialized()).to.be.true;
    });
  });
});
