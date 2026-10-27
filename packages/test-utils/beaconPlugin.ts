import { ethers } from 'hardhat';
import { deployPinnedProxyDeployer } from './pinnedProxy';

/// Role that gates the authorized functions of every plugin.
export const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));

/// Contracts every beacon plugin fixture starts from, handed to the per-module setup callback.
export interface BeaconPluginBase {
  owner: any;
  manager: any;
  user: any;
  otherUser: any;
  mockFactory: any;
  proxyDeployer: any;
  mockPool: any;
}

/// What a module contributes on top of the shared base.
export interface BeaconPluginSetup {
  /// Constructor arguments of the plugin test contract after (factory, pluginFactory).
  pluginArgs?: any[];
  /// Arguments of the initializer called through the proxy.
  initArgs?: any[];
  /// Initializer name, when the plugin does not use `initialize`.
  initFunction?: string;
  /// Extra deployments to expose on the fixture result.
  extra?: Record<string, any>;
}

export interface BeaconPluginFixture extends BeaconPluginBase {
  /// ContractFactory of the plugin test contract, use it to attach further proxies.
  PluginContract: any;
  /// Beacon implementation.
  pluginImplementation: any;
  beacon: any;
  /// Proxy deployed for `mockPool`.
  plugin1: any;
  ALGEBRA_BASE_PLUGIN_MANAGER: string;
  /// Deploy another proxy through the same beacon, for storage isolation tests.
  deployProxy: (pool: any, initArgs?: any[]) => Promise<any>;
  [key: string]: any;
}

/// Deploys a plugin behind a beacon proxy the way the production factories do.
/// @dev BeaconProxyDeployer stands in for the plugin factory, so the initializer gating is exercised.
export async function deployBeaconPluginFixture(options: {
  pluginContract: string;
  setup?: (base: BeaconPluginBase) => BeaconPluginSetup | Promise<BeaconPluginSetup>;
}): Promise<BeaconPluginFixture> {
  const [owner, manager, user, otherUser] = await ethers.getSigners();

  const mockFactory = await (await ethers.getContractFactory('MockFactory')).deploy();
  // Pinned bytecode on purpose, see pinnedProxy.ts: a coverage build moves the pool immutable
  const proxyDeployer = await deployPinnedProxyDeployer();
  const mockPool = await (await ethers.getContractFactory('MockPool')).deploy();

  const base: BeaconPluginBase = { owner, manager, user, otherUser, mockFactory, proxyDeployer, mockPool };

  const setup = options.setup ? await options.setup(base) : {};
  const pluginArgs = setup.pluginArgs ?? [];
  const initArgs = setup.initArgs ?? [];
  const initFunction = setup.initFunction ?? 'initialize';

  const PluginContract = await ethers.getContractFactory(options.pluginContract);
  const pluginImplementation = await PluginContract.deploy(mockFactory.target, proxyDeployer.target, ...pluginArgs);

  const beacon = await (await ethers.getContractFactory('UpgradeableBeacon')).deploy(pluginImplementation.target);

  const deployProxy = async (pool: any, args: any[] = initArgs) => {
    const initData = pluginImplementation.interface.encodeFunctionData(initFunction, args);
    await proxyDeployer.deploy(beacon.target, pool.target, initData);
    return PluginContract.attach(await proxyDeployer.lastDeployedProxy()) as any;
  };

  const plugin1 = await deployProxy(mockPool);
  await mockPool.setPlugin(plugin1.target);
  await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

  return {
    ...base,
    ...(setup.extra ?? {}),
    PluginContract,
    pluginImplementation,
    beacon,
    plugin1,
    deployProxy,
    ALGEBRA_BASE_PLUGIN_MANAGER
  };
}

/// Deploy a fresh MockPool, for tests that need a second pool.
export async function deployMockPool() {
  return (await ethers.getContractFactory('MockPool')).deploy();
}
