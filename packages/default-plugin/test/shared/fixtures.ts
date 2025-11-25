import { ethers } from 'hardhat';
import { MockFactory, MockPool, MockTimeDSFactory, MockTimeAlgebraUpgradeablePlugin } from '../../typechain';

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

// Upgradeable plugin fixture
interface PluginFixture extends MockFactoryFixture {
  plugin: MockTimeAlgebraUpgradeablePlugin;
  mockPluginFactory: MockTimeDSFactory;
  mockPool: MockPool;
}

export const pluginFixture: Fixture<PluginFixture> = async function (): Promise<PluginFixture> {
  const { mockFactory } = await mockFactoryFixture();

  // Deploy FarmingProxyPluginImplementation
  const farmingProxyImplFactory = await ethers.getContractFactory('FarmingProxyPluginImplementation');
  const farmingProxyImpl = await farmingProxyImplFactory.deploy();

  // Deploy MockTimeDSFactory (adapted for upgradeable plugin)
  const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
  const mockPluginFactory = (await mockPluginFactoryFactory.deploy(mockFactory, farmingProxyImpl)) as any as MockTimeDSFactory;

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