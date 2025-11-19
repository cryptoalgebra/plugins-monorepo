import { ethers } from 'hardhat';
import { MockFactory, MockPool, MockTimeAlgebraDefaultPlugin, MockTimeDSFactory, AlgebraDefaultPluginFactory } from '../../typechain';

type Fixture<T> = () => Promise<T>;
interface MockFactoryFixture {
  mockFactory: MockFactory;
  mockReflexRouter: any;
}
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function mockFactoryFixture(): Promise<MockFactoryFixture> {
  const mockFactoryFactory = await ethers.getContractFactory('MockFactory');
  const mockFactory = (await mockFactoryFactory.deploy()) as any as MockFactory;

  const mockReflexRouterFactory = await ethers.getContractFactory('MockReflexRouter');
  const mockReflexRouter = await mockReflexRouterFactory.deploy();

  return { mockFactory, mockReflexRouter };
}

interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraDefaultPlugin
  mockPluginFactory: MockTimeDSFactory
  mockPool: MockPool;
}

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory, mockReflexRouter } = await mockFactoryFixture();
  //const { token0, token1, token2 } = await tokensFixture()

  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(mockFactory)) as any as MockTimeDSFactory;

  // Set default router and config in factory
  await mockPluginFactory.setRouter(mockReflexRouter);

  const mockPoolFactory = await ethers.getContractFactory('MockPool');
  const mockPool = (await mockPoolFactory.deploy()) as any as MockPool;

  await mockPluginFactory.createPlugin(mockPool, ZERO_ADDRESS, ZERO_ADDRESS);
  const pluginAddress = await mockPluginFactory.pluginByPool(mockPool);

  const mockDSOperatorFactory = await ethers.getContractFactory('MockTimeAlgebraDefaultPlugin');
  const plugin = mockDSOperatorFactory.attach(pluginAddress) as any as MockTimeAlgebraDefaultPlugin;

  return {
    plugin,
    mockPluginFactory,
    mockPool,
    mockFactory,
    mockReflexRouter,
  };
};

interface PluginFactoryFixture extends MockFactoryFixture {
  pluginFactory: AlgebraDefaultPluginFactory;
}

export const pluginFactoryFixture: Fixture<PluginFactoryFixture> = async function (): Promise<PluginFactoryFixture> {
  const { mockFactory, mockReflexRouter } = await mockFactoryFixture();

  const pluginFactoryFactory = await ethers.getContractFactory('AlgebraDefaultPluginFactory');
  const pluginFactory = (await pluginFactoryFactory.deploy(mockFactory)) as any as AlgebraDefaultPluginFactory;

  // Set default router and config in factory
  await pluginFactory.setRouter(mockReflexRouter);

  return {
    pluginFactory,
    mockFactory,
    mockReflexRouter,
  };
};