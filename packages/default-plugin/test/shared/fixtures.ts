import { ethers } from 'hardhat';
import { MockFactory, MockPool, MockTimeDSFactory, MockTimeAlgebraUpgradeablePlugin, MockTimeUpgradeablePluginFactory, NewMockTimeUpgradeablePluginFactory } from '../../typechain';

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

  // 6. MevX Implementation
  const mevxImplFactory = await ethers.getContractFactory('MevxPluginImplementation');
  const mevxImpl = await mevxImplFactory.deploy();

  return {
    volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
    dynamicFeeImpl: await dynamicFeeImpl.getAddress(),
    farmingProxyImpl: await farmingProxyImpl.getAddress(),
    almImpl: await almImpl.getAddress(),
    securityImpl: await securityImpl.getAddress(),
    mevxImpl: await mevxImpl.getAddress()
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
    implementations.mevxImpl,
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

  // Deploy AlgebraUpgradeablePluginFactory implementation
  const pluginFactoryImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
  const pluginFactoryImpl = await pluginFactoryImplFactory.deploy();

  // Deploy TransparentUpgradeableProxy with ProxyAdmin
  const TransparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxyFactory.deploy(
    await pluginFactoryImpl.getAddress(),
    await proxyAdmin.getAddress(),
    '0x'
  );

  const proxyAddress = await proxy.getAddress();

  // Now deploy plugin implementation with the REAL proxy address as pluginFactory
  const pluginImplFactory = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
  const pluginImpl = await pluginImplFactory.deploy(
    mockFactoryAddress,
    proxyAddress, // Use real proxy address as pluginFactory
    implementations.volatilityOracleImpl,
    implementations.dynamicFeeImpl,
    implementations.farmingProxyImpl,
    implementations.almImpl,
    implementations.securityImpl,
    implementations.mevxImpl
  );

  const pluginFactory = pluginFactoryImplFactory.attach(proxyAddress);

  // Now initialize the factory with the correct plugin implementation
  await pluginFactory.initialize(
    mockFactoryAddress,
    await pluginImpl.getAddress(),
    DEFAULT_FEE_CONFIGURATION
  );

  return {
    pluginFactory,
    pluginFactoryImpl,
    proxyAdmin,
    proxyAdminOwner,
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
    implementations.mevxImpl,
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


interface NewMockTimeUpgradeablePluginFactoryFixture extends MockFactoryFixture {
  mockPluginFactory: NewMockTimeUpgradeablePluginFactory;
  factoryImpl: any;
  proxyAdmin: any;
  proxyAdminOwner: any;
  implementations: {
    volatilityOracleImpl: string;
    dynamicFeeImpl: string;
    farmingProxyImpl: string;
    almImpl: string;
    securityImpl: string;
    mevxImpl: string;
  };
}

export const newMockTimeUpgradeablePluginFactoryFixture: Fixture<NewMockTimeUpgradeablePluginFactoryFixture> = async function (): Promise<NewMockTimeUpgradeablePluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const implementations = await deployImplementations();
  const mockFactoryAddress = await mockFactory.getAddress();

  // Deploy ProxyAdmin
  const ProxyAdminFactory = await ethers.getContractFactory('ProxyAdmin');
  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1];
  const proxyAdmin = await ProxyAdminFactory.connect(proxyAdminOwner).deploy();

  // Deploy factory implementation
  const factoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
  const factoryImpl = await factoryImplFactory.deploy();

  // Deploy TransparentUpgradeableProxy
  const TransparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxyFactory.deploy(
    await factoryImpl.getAddress(),
    await proxyAdmin.getAddress(),
    '0x'
  );

  const proxyAddress = await proxy.getAddress();

  // Deploy MockTimeAlgebraUpgradeablePlugin 
  const pluginImplFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
  const pluginImpl = await pluginImplFactory.deploy(
    mockFactoryAddress,
    proxyAddress,  
    implementations.volatilityOracleImpl,
    implementations.dynamicFeeImpl,
    implementations.farmingProxyImpl,
    implementations.almImpl,
    implementations.securityImpl,
    implementations.mevxImpl
  );

  // Attach factory interface to proxy
  const pluginFactory = factoryImplFactory.attach(proxyAddress);

  // Initialize factory with plugin implementation
  await pluginFactory.initialize(
    mockFactoryAddress,
    await pluginImpl.getAddress(),  
    DEFAULT_FEE_CONFIGURATION
  );

  return {
    mockPluginFactory: pluginFactory as any as NewMockTimeUpgradeablePluginFactory, 
    factoryImpl,
    proxyAdmin,
    proxyAdminOwner,
    mockFactory,
    implementations
  };
};