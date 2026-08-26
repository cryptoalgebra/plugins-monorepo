import { ethers } from 'hardhat';
import {
  MockFactory,
  MockPool,
  MockTimeDSFactory,
  MockTimeAlgebraUpgradeablePlugin,
  MockTimeUpgradeablePluginFactory,
  NewMockTimeUpgradeablePluginFactory,
} from '../../typechain';

type Fixture<T> = () => Promise<T>;
interface MockFactoryFixture {
  mockFactory: MockFactory;
}
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function mockFactoryFixture(): Promise<MockFactoryFixture> {
  const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
  const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

  return { mockFactory };
}

// Deploy active implementation contracts.
async function deployImplementations() {
  // 1. VolatilityOracle Implementation
  const volatilityOracleImplFactory = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
  const volatilityOracleImpl = await volatilityOracleImplFactory.deploy();

  // 2. FarmingProxy Implementation
  const farmingProxyImplFactory = await ethers.getContractFactory('FarmingProxyPluginImplementation');
  const farmingProxyImpl = await farmingProxyImplFactory.deploy();

  // 3. Security Implementation
  const securityImplFactory = await ethers.getContractFactory('SecurityPluginImplementation');
  const securityImpl = await securityImplFactory.deploy();

  // Price Convergence Implementation
  const priceConvergenceImplFactory = await ethers.getContractFactory('PriceConvergencePluginImplementation');
  const priceConvergenceImpl = await priceConvergenceImplFactory.deploy();

  // Permissioned Pool Implementation
  const permissionedPoolImplFactory = await ethers.getContractFactory('PermissionedPoolPluginImplementation');
  const permissionedPoolImpl = await permissionedPoolImplFactory.deploy();

  return {
    volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
    farmingProxyImpl: await farmingProxyImpl.getAddress(),
    securityImpl: await securityImpl.getAddress(),
    priceConvergenceImpl: await priceConvergenceImpl.getAddress(),
    permissionedPoolImpl: await permissionedPoolImpl.getAddress(),
  };
}

// Upgradeable plugin fixture with active modules.
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
    implementations.farmingProxyImpl,
    implementations.securityImpl,
    implementations.priceConvergenceImpl
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
  const [wallet] = await ethers.getSigners();
  await plugin.setVault(wallet.address);

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
    implementations.farmingProxyImpl,
    implementations.securityImpl,
    implementations.priceConvergenceImpl,
    implementations.permissionedPoolImpl
  );

  const pluginFactory = pluginFactoryImplFactory.attach(proxyAddress);

  // Now initialize the factory with the correct plugin implementation
  await pluginFactory.initialize(mockFactoryAddress, await pluginImpl.getAddress());

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

  // Deploy MockTimeUpgradeablePluginFactory with active implementations
  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeUpgradeablePluginFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(
    mockFactory,
    implementations.volatilityOracleImpl,
    implementations.farmingProxyImpl,
    implementations.securityImpl,
    implementations.priceConvergenceImpl
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
  const [wallet] = await ethers.getSigners();
  await plugin.setVault(wallet.address);

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
    farmingProxyImpl: string;
    securityImpl: string;
    priceConvergenceImpl: string;
    permissionedPoolImpl: string;
  };
}

export const newMockTimeUpgradeablePluginFactoryFixture: Fixture<NewMockTimeUpgradeablePluginFactoryFixture> = async function (): Promise<NewMockTimeUpgradeablePluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();
  const activeImplementations = await deployImplementations();
  const mockFactoryAddress = await mockFactory.getAddress();

  const signers = await ethers.getSigners();
  const proxyAdminOwner = signers[signers.length - 1];
  const ProxyAdminFactory = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdminFactory.connect(proxyAdminOwner).deploy();

  const factoryImplFactory = await ethers.getContractFactory('NewMockTimeUpgradeablePluginFactory');
  const factoryImpl = await factoryImplFactory.deploy();

  const TransparentProxyFactory = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentProxyFactory.deploy(
    await factoryImpl.getAddress(),
    await proxyAdmin.getAddress(),
    '0x'
  );
  const proxyAddress = await proxy.getAddress();

  const pluginImplFactory = await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin');
  const pluginImpl = await pluginImplFactory.deploy(
    mockFactoryAddress,
    proxyAddress,
    activeImplementations.volatilityOracleImpl,
    activeImplementations.farmingProxyImpl,
    activeImplementations.securityImpl,
    activeImplementations.priceConvergenceImpl,
    activeImplementations.permissionedPoolImpl
  );

  const pluginFactory = factoryImplFactory.attach(proxyAddress);
  await pluginFactory.initialize(mockFactoryAddress, await pluginImpl.getAddress());

  return {
    mockPluginFactory: pluginFactory as any as NewMockTimeUpgradeablePluginFactory,
    factoryImpl,
    proxyAdmin,
    proxyAdminOwner,
    mockFactory,
    implementations: {
      volatilityOracleImpl: activeImplementations.volatilityOracleImpl,
      farmingProxyImpl: activeImplementations.farmingProxyImpl,
      securityImpl: activeImplementations.securityImpl,
      priceConvergenceImpl: activeImplementations.priceConvergenceImpl,
      permissionedPoolImpl: activeImplementations.permissionedPoolImpl,
    },
  };
};
