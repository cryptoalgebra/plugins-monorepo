import { ethers } from 'hardhat';
import { pinnedMockTimePluginFactory } from './pinnedFactory';
import { setBalance } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { MockFactory, MockPool, MockTimeAlgebraUpgradeablePlugin, NewMockTimeUpgradeablePluginFactory } from '../../typechain';

type Fixture<T> = () => Promise<T>;
interface MockFactoryFixture {
  mockFactory: MockFactory;
}
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Default fee configuration for tests
export const DEFAULT_FEE_CONFIGURATION = {
  alpha1: 2900,
  alpha2: 12000,
  beta1: 360,
  beta2: 60000,
  gamma1: 59,
  gamma2: 8500,
  baseFee: 100
};

// Mirrors the ModuleImplementations struct the plugin constructor takes
export interface ModuleImplementations {
  volatilityOracle: string;
  dynamicFee: string;
  farmingProxy: string;
  alm: string;
  security: string;
}

const IMPLEMENTATION_CONTRACTS: Record<keyof ModuleImplementations, string> = {
  volatilityOracle: 'VolatilityOraclePluginImplementation',
  dynamicFee: 'DynamicFeePluginImplementation',
  farmingProxy: 'FarmingProxyPluginImplementation',
  alm: 'AlmPluginImplementation',
  security: 'SecurityPluginImplementation'
};

// Deploy one implementation per module
export async function deployImplementations(): Promise<ModuleImplementations> {
  const deployed = await Promise.all(
    Object.entries(IMPLEMENTATION_CONTRACTS).map(async ([module, contractName]) => {
      const impl = await (await ethers.getContractFactory(contractName)).deploy();
      return [module, await impl.getAddress()] as const;
    })
  );

  return Object.fromEntries(deployed) as unknown as ModuleImplementations;
}

// All modules pointed at the zero address, for tests that never call into them
export const EMPTY_IMPLEMENTATIONS: ModuleImplementations = {
  volatilityOracle: ZERO_ADDRESS,
  dynamicFee: ZERO_ADDRESS,
  farmingProxy: ZERO_ADDRESS,
  alm: ZERO_ADDRESS,
  security: ZERO_ADDRESS
};

// Same module set with some modules pointed at other implementations
export function withImpl(base: ModuleImplementations, overrides: Partial<ModuleImplementations>): ModuleImplementations {
  return { ...base, ...overrides };
}

async function mockFactoryFixture(): Promise<MockFactoryFixture> {
  const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
  const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

  return { mockFactory };
}

// Sends from a contract's own address, for entry points guarded by msg.sender
export async function impersonateContract(contract: any) {
  const address = await contract.getAddress();
  await setBalance(address, 10n ** 20n);
  return await ethers.getImpersonatedSigner(address);
}

// beforeCreatePoolHook is only callable by the Algebra factory, so tests drive it from that address
export async function impersonateAlgebraFactory(mockFactory: any) {
  return impersonateContract(mockFactory);
}

interface PluginFactoryDeployment {
  mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  factoryImpl: any;
  proxyAdmin: any;
  proxyAdminOwner: any;
}

// Deploy the mock plugin factory behind a TransparentUpgradeableProxy, matching production wiring
export async function deployPluginFactory(
  mockFactory: any,
  implementations: ModuleImplementations,
  pluginContractName = 'MockTimeAlgebraUpgradeablePlugin'
): Promise<PluginFactoryDeployment> {
  const mockFactoryAddress = await mockFactory.getAddress();

  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1];
  const ProxyAdminFactory = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdminFactory.connect(proxyAdminOwner).deploy();

  const factoryImplFactory = await pinnedMockTimePluginFactory();
  const factoryImpl = await factoryImplFactory.deploy();

  const TransparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxyFactory.deploy(await factoryImpl.getAddress(), await proxyAdmin.getAddress(), '0x');
  const proxyAddress = await proxy.getAddress();

  // The plugin implementation needs the factory proxy address, so it is deployed after the proxy
  const pluginImplFactory = await ethers.getContractFactory(pluginContractName);
  const pluginImpl = await pluginImplFactory.deploy(mockFactoryAddress, proxyAddress, implementations);

  const mockPluginFactory = factoryImplFactory.attach(proxyAddress) as any as NewMockTimeUpgradeablePluginFactory;
  await mockPluginFactory.initialize(mockFactoryAddress, await pluginImpl.getAddress(), DEFAULT_FEE_CONFIGURATION);

  return { mockPluginFactory, factoryImpl, proxyAdmin, proxyAdminOwner };
}

// Upgradeable plugin fixture with all 5 modules
interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraUpgradeablePlugin;
  mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  mockPool: MockPool;
  implementations: ModuleImplementations;
}

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();
  const { mockPluginFactory } = await deployPluginFactory(mockFactory, implementations);

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  const algebraFactorySigner = await impersonateAlgebraFactory(mockFactory);
  await mockPluginFactory
    .connect(algebraFactorySigner)
    .beforeCreatePoolHook(mockPool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  const pluginContractFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
  const plugin = pluginContractFactory.attach(pluginAddress) as any as MockTimeAlgebraUpgradeablePlugin;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
    implementations
  };
};

// Kept as an alias: the two mock factories this fixture pair used differed only in the algebraFactory check
// The shared harness derives from production, so both fixtures now go through that check
export const upgradeablePluginFixture = pluginFixture;

// AlgebraUpgradeablePluginFactory fixture (Transparent Upgradeable Proxy)
interface PluginFactoryFixture extends MockFactoryFixture {
  pluginFactory: any;
  pluginFactoryImpl: any;
  proxyAdmin: any;
  proxyAdminOwner: any;
}

export const pluginFactoryFixture: Fixture<PluginFactoryFixture> = async function (): Promise<PluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();

  const mockFactoryAddress = await (mockFactory as any).getAddress();

  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1]; // Use last signer as ProxyAdmin owner

  const ProxyAdminFactory = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdminFactory.connect(proxyAdminOwner).deploy();

  const pluginFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
  const pluginFactoryImpl = await pluginFactoryImplFactory.deploy();

  const TransparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxyFactory.deploy(await pluginFactoryImpl.getAddress(), await proxyAdmin.getAddress(), '0x');

  const proxyAddress = await proxy.getAddress();

  // Now deploy plugin implementation with the REAL proxy address as pluginFactory
  const pluginImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
  const pluginImpl = await pluginImplFactory.deploy(mockFactoryAddress, proxyAddress, implementations);

  const pluginFactory = pluginFactoryImplFactory.attach(proxyAddress);

  await pluginFactory.initialize(mockFactoryAddress, await pluginImpl.getAddress(), DEFAULT_FEE_CONFIGURATION);

  return {
    pluginFactory,
    pluginFactoryImpl,
    proxyAdmin,
    proxyAdminOwner,
    mockFactory
  };
};

interface NewMockTimeUpgradeablePluginFactoryFixture extends MockFactoryFixture {
  mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  factoryImpl: any;
  proxyAdmin: any;
  proxyAdminOwner: any;
  implementations: ModuleImplementations;
}

export const newMockTimeUpgradeablePluginFactoryFixture: Fixture<NewMockTimeUpgradeablePluginFactoryFixture> =
  async function (): Promise<NewMockTimeUpgradeablePluginFactoryFixture> {
    const { mockFactory } = await mockFactoryFixture();
    const implementations = await deployImplementations();
    const deployment = await deployPluginFactory(mockFactory, implementations);

    return { ...deployment, mockFactory, implementations };
  };
