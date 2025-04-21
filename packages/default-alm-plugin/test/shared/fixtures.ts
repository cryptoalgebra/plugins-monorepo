import { ethers } from 'hardhat';
import { MockFactory, MockPool, MockTimeAlgebraDefaultPlugin, MockTimeDSFactory, AlgebraDefaultPluginFactory, MockVault, MockDefaultAlmPlugin, MockDefaultAlmPluginFactory} from '../../typechain';

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

interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraDefaultPlugin
  mockPluginFactory: MockTimeDSFactory
  mockPool: MockPool;
}

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  //const { token0, token1, token2 } = await tokensFixture()

  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(mockFactory)) as any as MockTimeDSFactory;

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  await mockPluginFactory.beforeCreatePoolHook(mockPool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  const mockDSOperatorFactory = await ethers.getContractFactory('MockTimeAlgebraDefaultPlugin');
  const plugin = mockDSOperatorFactory.attach(pluginAddress) as any as MockTimeAlgebraDefaultPlugin;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
  };
};

interface PluginFactoryFixture extends MockFactoryFixture {
  pluginFactory: AlgebraDefaultPluginFactory;
}

export const pluginFactoryFixture: Fixture<PluginFactoryFixture> = async function (): Promise<PluginFactoryFixture> {
  const { mockFactory } = await mockFactoryFixture();

  const pluginFactoryFactory = await ethers.getContractFactory('AlgebraDefaultPluginFactory');
  const pluginFactory = (await pluginFactoryFactory.deploy(mockFactory)) as any as AlgebraDefaultPluginFactory;

  return {
    pluginFactory,
    mockFactory,
  };
};

// Monday, October 5, 2020 9:00:00 AM GMT-05:00
export const TEST_POOL_START_TIME = 1601906400;
export const TEST_POOL_DAY_BEFORE_START = 1601906400 - 24 * 60 * 60;

interface ALMPluginFixture extends MockFactoryFixture {
  mockVault: MockVault;
  plugin: MockDefaultAlmPlugin;
  mockPluginFactory: MockDefaultAlmPluginFactory;
  mockPool: MockPool;
}

export const pluginFixtureALM: Fixture<ALMPluginFixture> = async function (): Promise<ALMPluginFixture> {
  const { mockFactory } = await mockFactoryFixture();
  //const { token0, token1, token2 } = await tokensFixture()

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  await mockPool.setFactory(mockFactory);

  const mockPluginFactoryFactory = await ethers.getContractFactory('MockDefaultAlmPluginFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(mockFactory)) as any as MockDefaultAlmPluginFactory;

  const mockVaultFactory = await ethers.getContractFactory('MockVault');
  const mockVault = await mockVaultFactory.deploy(await mockPool.getAddress(), true, false) as any as MockVault;

  await mockVault.setAllowTokens(true, false);

  await mockPluginFactory.beforeCreatePoolHook(mockPool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  const mockDefaultAlmPluginFactory = await ethers.getContractFactory('MockDefaultAlmPlugin');
  const plugin = mockDefaultAlmPluginFactory.attach(pluginAddress) as any as MockDefaultAlmPlugin ;

  return {
    mockVault,
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
  };
};

