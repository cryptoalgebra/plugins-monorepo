import { ethers } from 'hardhat';

// ============================
// CONFIG (EDIT THESE)
// ============================

const CONFIG = {
  // Algebra core factory on the target network
  algebraFactory: '0x63297eA574a29b396Ae821fE9830E8C7a677A7C9',

  // Optional post-config
  farmingCenter: '0xA64356A430066d1a956bd8631bCf151a1C482C5a',

  // Reflex defaults (optional; leave zero/bytes32(0) to skip)
  reflexRouter: '0x0000000000000000000000000000000000000000',
  reflexConfigId: '0x0000000000000000000000000000000000000000000000000000000000000000',

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

  // ----------------------------
  // 1) Deploy module implementations
  // ----------------------------
  const VolatilityOracleImpl = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
  const volatilityOracleImpl = await VolatilityOracleImpl.deploy();
  await volatilityOracleImpl.waitForDeployment();

  const DynamicFeeImpl = await ethers.getContractFactory('DynamicFeePluginImplementation');
  const dynamicFeeImpl = await DynamicFeeImpl.deploy();
  await dynamicFeeImpl.waitForDeployment();

  const FarmingProxyImpl = await ethers.getContractFactory('FarmingProxyPluginImplementation');
  const farmingProxyImpl = await FarmingProxyImpl.deploy();
  await farmingProxyImpl.waitForDeployment();

  const AlmImpl = await ethers.getContractFactory('AlmPluginImplementation');
  const almImpl = await AlmImpl.deploy();
  await almImpl.waitForDeployment();

  const SecurityImpl = await ethers.getContractFactory('SecurityPluginImplementation');
  const securityImpl = await SecurityImpl.deploy();
  await securityImpl.waitForDeployment();

  const ReflexImpl = await ethers.getContractFactory('ReflexPluginImplementation');
  const reflexImpl = await ReflexImpl.deploy();
  await reflexImpl.waitForDeployment();

  console.log('Implementations:', {
    volatilityOracleImpl: await volatilityOracleImpl.getAddress(),
    dynamicFeeImpl: await dynamicFeeImpl.getAddress(),
    farmingProxyImpl: await farmingProxyImpl.getAddress(),
    almImpl: await almImpl.getAddress(),
    securityImpl: await securityImpl.getAddress(),
    reflexImpl: await reflexImpl.getAddress(),
  });

  // ----------------------------
  // 2) Deploy ProxyAdmin
  // ----------------------------
  const ProxyAdmin = await ethers.getContractFactory('ProxyAdmin');
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  console.log('ProxyAdmin:', await proxyAdmin.getAddress());

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
    await reflexImpl.getAddress()
  );
  await pluginImpl.waitForDeployment();
  console.log('PluginImplementation:', await pluginImpl.getAddress());

  // ----------------------------
  // 5) Deploy factory implementation
  // ----------------------------
  const FactoryImpl = await ethers.getContractFactory('AlgebraUpgradeablePluginFactory');
  const factoryImpl = await FactoryImpl.deploy();
  await factoryImpl.waitForDeployment();
  console.log('FactoryImplementation:', await factoryImpl.getAddress());

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
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
