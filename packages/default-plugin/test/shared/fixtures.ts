import { ethers } from 'hardhat';
import { MockFactory, MockPool, MockTimeDSFactory, MockTimeAlgebraUpgradeablePlugin, MockTimeUpgradeablePluginFactory } from '../../typechain';

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

async function mockFactoryFixture(): Promise<MockFactoryFixture> {
  const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
  const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

  return { mockFactory };
}

// Deploy all 5 implementation contracts
// Note: These contracts are imported via TestImports.sol to ensure they are compiled
async function deployImplementations() {
  // 1. VolatilityOracle Implementation
  const volatilityOracleImplFactory = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
  const volatilityOracleImpl = await volatilityOracleImplFactory.deploy();

  // 2. DynamicFee Implementation
  const dynamicFeeImplFactory = await ethers.getContractFactory('DynamicFeePluginImplementation');
  const dynamicFeeImpl = await dynamicFeeImplFactory.deploy();

  // 3. FarmingProxy Implementation
  const farmingProxyImplFactory = await ethers.getContractFactory('FarmingProxyPluginImplementation');
  const farmingProxyImpl = await farmingProxyImplFactory.deploy();

  // 4. ALM Implementation
  const almImplFactory = await ethers.getContractFactory('AlmPluginImplementation');
  const almImpl = await almImplFactory.deploy();

  // 5. Security Implementation
  const securityImplFactory = await ethers.getContractFactory('SecurityPluginImplementation');
  const securityImpl = await securityImplFactory.deploy();

  return {
    volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
    dynamicFeeImpl: await dynamicFeeImpl.getAddress(),
    farmingProxyImpl: await farmingProxyImpl.getAddress(),
    almImpl: await almImpl.getAddress(),
    securityImpl: await securityImpl.getAddress()
  };
}

// Upgradeable plugin fixture with all 5 modules
interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraUpgradeablePlugin;
  mockPluginFactory: MockTimeDSFactory;
  mockPool: MockPool;
}

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();

  // Deploy MockTimeDSFactory with all implementations
  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(
    mockFactory,
    implementations.volatilityOracleImpl,
    implementations.dynamicFeeImpl,
    implementations.farmingProxyImpl,
    implementations.almImpl,
    implementations.securityImpl,
    DEFAULT_FEE_CONFIGURATION
  )) as any as MockTimeDSFactory;

  // Deploy MockPool
  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  // Create plugin via beforeCreatePoolHook
  await mockPluginFactory.beforeCreatePoolHook(mockPool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  // Attach to plugin
  const pluginContractFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
  const plugin = pluginContractFactory.attach(pluginAddress) as any as MockTimeAlgebraUpgradeablePlugin;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
  };
};

// AlgebraUpgradeablePluginFactory fixture (UUPS upgradeable)
interface PluginFactoryFixture extends MockFactoryFixture {
  pluginFactory: any;
  pluginFactoryImpl: any;
}

export const pluginFactoryFixture: Fixture<PluginFactoryFixture> = async function (): Promise<PluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();

  const mockFactoryAddress = await (mockFactory as any).getAddress();

  // Deploy plugin implementation for beacon
  const pluginImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
  const pluginImpl = await pluginImplFactory.deploy(
    mockFactoryAddress,
    '0x0000000000000000000000000000000000000001', // placeholder for pluginFactory
    implementations.volatilityOracleImpl,
    implementations.dynamicFeeImpl,
    implementations.farmingProxyImpl,
    implementations.almImpl,
    implementations.securityImpl
  );

  // Deploy AlgebraUpgradeablePluginFactory implementation (for UUPS)
  const pluginFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
  const pluginFactoryImpl = await pluginFactoryImplFactory.deploy();

  // Encode initialize call data
  const initData = pluginFactoryImpl.interface.encodeFunctionData('initialize', [
    mockFactoryAddress,
    await pluginImpl.getAddress(),
    DEFAULT_FEE_CONFIGURATION
  ]);

  // Deploy ERC1967Proxy pointing to the implementation
  const ERC1967ProxyFactory = await ethers.getContractFactory('ERC1967Proxy');
  const proxy = await ERC1967ProxyFactory.deploy(
    await pluginFactoryImpl.getAddress(),
    initData
  );

  // Attach factory interface to proxy
  const pluginFactory = pluginFactoryImplFactory.attach(await proxy.getAddress());

  return {
    pluginFactory,
    pluginFactoryImpl,
    mockFactory,
  };
};

// Upgradeable plugin fixture using MockTimeUpgradeablePluginFactory
interface UpgradeablePluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraUpgradeablePlugin;
  mockPluginFactory: MockTimeUpgradeablePluginFactory;
  mockPool: MockPool;
}

export const upgradeablePluginFixture: Fixture<UpgradeablePluginFixture> = async function (): Promise<UpgradeablePluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();

  // Deploy MockTimeUpgradeablePluginFactory with all implementations
  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeUpgradeablePluginFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(
    mockFactory,
    implementations.volatilityOracleImpl,
    implementations.dynamicFeeImpl,
    implementations.farmingProxyImpl,
    implementations.almImpl,
    implementations.securityImpl,
    DEFAULT_FEE_CONFIGURATION
  )) as any as MockTimeUpgradeablePluginFactory;

  // Deploy MockPool
  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  // Create plugin via beforeCreatePoolHook
  await mockPluginFactory.beforeCreatePoolHook(mockPool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  // Attach to plugin
  const pluginContractFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
  const plugin = pluginContractFactory.attach(pluginAddress) as any as MockTimeAlgebraUpgradeablePlugin;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
  };
};