import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

// ============================
// CONFIG (EDIT THESE)
// ============================

const CONFIG = {
  // Algebra core factory on the target network
  algebraFactory: '0x10253594A832f967994b44f33411940533302ACb',

  // Optional post-config
  farmingCenter: '0x658E287E9C820484f5808f687dC4863B552de37D',

  // Reflex defaults (optional; leave zero/bytes32(0) to skip)
  reflexRouter: '0x0000000000000000000000000000000000000000',
  reflexConfigId: '0x0000000000000000000000000000000000000000000000000000000000000000',

  // LimitOrderManager constructor args
  wNativeToken: '0x0000000000000000000000000000000000000000',
  poolDeployer: '0x0000000000000000000000000000000000000000',

  // Default fee config
  defaultFeeConfig: {
    alpha1: 2900,
    alpha2: 12000,
    beta1: 360,
    beta2: 60000,
    gamma1: 59,
    gamma2: 8500,
    baseFee: 100,
  },
};

function requireConfiguredAddress(value: string, label: string): string {
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${label}: ${value}`);
  if (value === ethers.ZeroAddress) throw new Error(`${label} is not configured (still zero address)`);
  return value;
}

async function main() {
  const algebraFactory = requireConfiguredAddress(CONFIG.algebraFactory, 'CONFIG.algebraFactory');

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const network = await ethers.provider.getNetwork();
  console.log('Network:', { chainId: network.chainId.toString(), name: network.name });
  console.log('Deployer:', deployerAddress);
  console.log('AlgebraFactory:', algebraFactory);

  const deploymentsDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const nowIso = new Date().toISOString().replace(/[:.]/g, '-');
  const deploymentFile = path.join(deploymentsDir, `${network.name}-${network.chainId.toString()}-${nowIso}.json`);

  const deployment: any = {
    network: {
      name: network.name,
      chainId: network.chainId.toString(),
    },
    deployer: deployerAddress,
    algebraFactory,
    createdAt: new Date().toISOString(),
    contracts: {},
  };

  const record = (name: string, address: string, constructorArgs?: any[]) => {
    deployment.contracts[name] = { address, constructorArgs: constructorArgs ?? [] };
  };

  // ----------------------------
  // 1) Deploy module implementations
  // ----------------------------
  const VolatilityOracleImpl = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
  const volatilityOracleImpl = await VolatilityOracleImpl.deploy();
  await volatilityOracleImpl.waitForDeployment();
  record('VolatilityOraclePluginImplementation', await volatilityOracleImpl.getAddress());

  const DynamicFeeImpl = await ethers.getContractFactory('DynamicFeePluginImplementation');
  const dynamicFeeImpl = await DynamicFeeImpl.deploy();
  await dynamicFeeImpl.waitForDeployment();
  record('DynamicFeePluginImplementation', await dynamicFeeImpl.getAddress());

  const FarmingProxyImpl = await ethers.getContractFactory('FarmingProxyPluginImplementation');
  const farmingProxyImpl = await FarmingProxyImpl.deploy();
  await farmingProxyImpl.waitForDeployment();
  record('FarmingProxyPluginImplementation', await farmingProxyImpl.getAddress());

  const AlmImpl = await ethers.getContractFactory('AlmPluginImplementation');
  const almImpl = await AlmImpl.deploy();
  await almImpl.waitForDeployment();
  record('AlmPluginImplementation', await almImpl.getAddress());

  const SecurityImpl = await ethers.getContractFactory('SecurityPluginImplementation');
  const securityImpl = await SecurityImpl.deploy();
  await securityImpl.waitForDeployment();
  record('SecurityPluginImplementation', await securityImpl.getAddress());

  const ReflexImpl = await ethers.getContractFactory('ReflexPluginImplementation');
  const reflexImpl = await ReflexImpl.deploy();
  await reflexImpl.waitForDeployment();
  record('ReflexPluginImplementation', await reflexImpl.getAddress());

  const FeeDiscountImpl = await ethers.getContractFactory('FeeDiscountPluginImplementation');
  const feeDiscountImpl = await FeeDiscountImpl.deploy();
  await feeDiscountImpl.waitForDeployment();
  record('FeeDiscountPluginImplementation', await feeDiscountImpl.getAddress());

  const LimitOrderImpl = await ethers.getContractFactory('LimitOrderPluginImplementation');
  const limitOrderImpl = await LimitOrderImpl.deploy();
  await limitOrderImpl.waitForDeployment();
  record('LimitOrderPluginImplementation', await limitOrderImpl.getAddress());

  console.log('Implementations:', {
    volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
    dynamicFeeImpl: await dynamicFeeImpl.getAddress(),
    farmingProxyImpl: await farmingProxyImpl.getAddress(),
    almImpl: await almImpl.getAddress(),
    securityImpl: await securityImpl.getAddress(),
    reflexImpl: await reflexImpl.getAddress(),
    feeDiscountImpl: await feeDiscountImpl.getAddress(),
    limitOrderImpl: await limitOrderImpl.getAddress(),
  });

  // ----------------------------
  // 2) Deploy ProxyAdmin
  // ----------------------------
  const ProxyAdmin = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  console.log('ProxyAdmin:', await proxyAdmin.getAddress());
  record('ProxyAdmin', await proxyAdmin.getAddress());

  // ----------------------------
  // 3) Deploy factory proxy placeholder
  // ----------------------------
  // We need the proxy address before deploying the plugin implementation.
  // So we deploy a TransparentUpgradeableProxy with a temporary implementation, then upgrade+initialize later.
  const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const factoryProxy = await TransparentUpgradeableProxy.deploy(
    await proxyAdmin.getAddress(), // temporary implementation
    await proxyAdmin.getAddress(), // admin
    '0x' // no init
  );
  await factoryProxy.waitForDeployment();
  const factoryProxyAddress = await factoryProxy.getAddress();
  console.log('FactoryProxy:', factoryProxyAddress);
  record('TransparentUpgradeableProxy', factoryProxyAddress, [await proxyAdmin.getAddress(), await proxyAdmin.getAddress(), '0x']);

  // ----------------------------
  // 4) Deploy plugin implementation (needs factoryProxy address)
  // ----------------------------
  const PluginImpl = await ethers.getContractFactory('AlgebraUpgradeablePlugin');
  const pluginImpl = await PluginImpl.deploy(
    algebraFactory,
    factoryProxyAddress,
    await volatilityOracleImpl.getAddress(),
    await dynamicFeeImpl.getAddress(),
    await farmingProxyImpl.getAddress(),
    await almImpl.getAddress(),
    await securityImpl.getAddress(),
    await reflexImpl.getAddress(),
    await feeDiscountImpl.getAddress(),
    await limitOrderImpl.getAddress()
  );
  await pluginImpl.waitForDeployment();
  console.log('PluginImplementation:', await pluginImpl.getAddress());
  record('AlgebraUpgradeablePlugin', await pluginImpl.getAddress(), [
    algebraFactory,
    factoryProxyAddress,
    await volatilityOracleImpl.getAddress(),
    await dynamicFeeImpl.getAddress(),
    await farmingProxyImpl.getAddress(),
    await almImpl.getAddress(),
    await securityImpl.getAddress(),
    await reflexImpl.getAddress(),
    await feeDiscountImpl.getAddress(),
    await limitOrderImpl.getAddress(),
  ]);

  // ----------------------------
  // 5) Deploy factory implementation
  // ----------------------------
  const FactoryImpl = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
  const factoryImpl = await FactoryImpl.deploy();
  await factoryImpl.waitForDeployment();
  console.log('FactoryImplementation:', await factoryImpl.getAddress());
  record('AlgebraUpgradeablePluginFactory', await factoryImpl.getAddress());

  // ----------------------------
  // 6) Upgrade proxy -> factoryImpl and initialize
  // ----------------------------
  const initData = FactoryImpl.interface.encodeFunctionData('initialize', [
    algebraFactory,
    await pluginImpl.getAddress(),
    CONFIG.defaultFeeConfig,
  ]);

  const upgradeTx = await proxyAdmin.upgradeAndCall(factoryProxyAddress, await factoryImpl.getAddress(), initData);
  console.log('upgradeAndCall tx:', upgradeTx.hash);
  await upgradeTx.wait();

  const factory = await ethers.getContractAt('AlgebraUpgradeablePluginFactory', factoryProxyAddress, deployer);

  // ----------------------------
  // 7) Deploy SecurityRegistry
  // ----------------------------
  const SecurityRegistry = await ethers.getContractFactory('SecurityRegistry');
  const securityRegistry = await SecurityRegistry.deploy(algebraFactory);
  await securityRegistry.waitForDeployment();
  const securityRegistryAddress = await securityRegistry.getAddress();
  console.log('SecurityRegistry:', securityRegistryAddress);
  record('SecurityRegistry', securityRegistryAddress, [algebraFactory]);

  // ----------------------------
  // 7b) Deploy FeeDiscountRegistry
  // ----------------------------
  const FeeDiscountRegistry = await ethers.getContractFactory('FeeDiscountRegistry');
  const feeDiscountRegistry = await FeeDiscountRegistry.deploy(algebraFactory);
  await feeDiscountRegistry.waitForDeployment();
  const feeDiscountRegistryAddress = await feeDiscountRegistry.getAddress();
  console.log('FeeDiscountRegistry:', feeDiscountRegistryAddress);
  record('FeeDiscountRegistry', feeDiscountRegistryAddress, [algebraFactory]);

  // ----------------------------
  // 7c) Deploy LimitOrderManager
  // ----------------------------
  const LimitOrderManager = await ethers.getContractFactory('LimitOrderManager');
  const limitOrderManager = await LimitOrderManager.deploy(
    CONFIG.wNativeToken,
    CONFIG.poolDeployer,
    factoryProxyAddress,
    algebraFactory
  );
  await limitOrderManager.waitForDeployment();
  const limitOrderManagerAddress = await limitOrderManager.getAddress();
  console.log('LimitOrderManager:', limitOrderManagerAddress);
  record('LimitOrderManager', limitOrderManagerAddress, [CONFIG.wNativeToken, CONFIG.poolDeployer, factoryProxyAddress, algebraFactory]);

  // ----------------------------
  // 8) Post-deploy configuration
  // ----------------------------
  if (CONFIG.farmingCenter !== ethers.ZeroAddress) {
    const tx = await factory.setFarmingAddress(CONFIG.farmingCenter);
    console.log('setFarmingAddress tx:', tx.hash);
    await tx.wait();
  }

  {
    const tx = await factory.setSecurityRegistry(securityRegistryAddress);
    console.log('setSecurityRegistry tx:', tx.hash);
    await tx.wait();
  }

  {
    const tx = await factory.setFeeDiscountRegistry(feeDiscountRegistryAddress);
    console.log('setFeeDiscountRegistry tx:', tx.hash);
    await tx.wait();
  }

  {
    const tx = await factory.setLimitOrderManager(limitOrderManagerAddress);
    console.log('setLimitOrderManager tx:', tx.hash);
    await tx.wait();
  }

  // Set DefaultPluginFactory in AlgebraFactory
  const algebraFactoryContract = new ethers.Contract(
    algebraFactory,
    ['function setDefaultPluginFactory(address newDefaultPluginFactory) external'],
    deployer
  );
  {
    const tx = await algebraFactoryContract.setDefaultPluginFactory(factoryProxyAddress);
    console.log('setDefaultPluginFactory tx:', tx.hash);
    await tx.wait();
  }

  if (CONFIG.reflexRouter !== ethers.ZeroAddress) {
    const tx = await factory.setRouter(CONFIG.reflexRouter);
    console.log('setRouter tx:', tx.hash);
    await tx.wait();
  }

  if (CONFIG.reflexConfigId !== ethers.ZeroHash) {
    const tx = await factory.setConfigId(CONFIG.reflexConfigId);
    console.log('setConfigId tx:', tx.hash);
    await tx.wait();
  }

  console.log('Done:', {
    factoryProxy: factoryProxyAddress,
    proxyAdmin: await proxyAdmin.getAddress(),
    factoryImpl: await factoryImpl.getAddress(),
    pluginImpl: await pluginImpl.getAddress(),
    securityRegistry: securityRegistryAddress,
    feeDiscountRegistry: feeDiscountRegistryAddress,
    limitOrderManager: limitOrderManagerAddress,
  });

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log('Saved deployment file:', deploymentFile);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
