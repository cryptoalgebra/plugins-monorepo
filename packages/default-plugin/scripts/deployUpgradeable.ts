import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x000000000000000000000000000000000000000000",

  // Farming center address (optional, can be set later)
  farmingCenter: "0x000000000000000000000000000000000000000000",

  // Default fee configuration for dynamic fee module
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ERC-1967 admin slot, where the factory proxy keeps the ProxyAdmin it deployed
const PROXY_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  // ============= 1. DEPLOY MODULE IMPLEMENTATIONS =============
  console.log("=== Deploying Module Implementations ===");

  const VolatilityOracleImpl = await ethers.getContractFactory("VolatilityOraclePluginImplementation");
  const volatilityOracleImpl = await VolatilityOracleImpl.deploy();
  await volatilityOracleImpl.waitForDeployment();
  console.log("VolatilityOracleImpl:", await volatilityOracleImpl.getAddress());

  const DynamicFeeImpl = await ethers.getContractFactory("DynamicFeePluginImplementation");
  const dynamicFeeImpl = await DynamicFeeImpl.deploy();
  await dynamicFeeImpl.waitForDeployment();
  console.log("DynamicFeeImpl:", await dynamicFeeImpl.getAddress());

  const FarmingProxyImpl = await ethers.getContractFactory("FarmingProxyPluginImplementation");
  const farmingProxyImpl = await FarmingProxyImpl.deploy();
  await farmingProxyImpl.waitForDeployment();
  console.log("FarmingProxyImpl:", await farmingProxyImpl.getAddress());

  const AlmImpl = await ethers.getContractFactory("AlmPluginImplementation");
  const almImpl = await AlmImpl.deploy();
  await almImpl.waitForDeployment();
  console.log("AlmImpl:", await almImpl.getAddress());

  const SecurityImpl = await ethers.getContractFactory("SecurityPluginImplementation");
  const securityImpl = await SecurityImpl.deploy();
  await securityImpl.waitForDeployment();
  console.log("SecurityImpl:", await securityImpl.getAddress());


  // ============= 2. DEPLOY FACTORY IMPLEMENTATION =============
  console.log("=== Deploying Factory Implementation ===");

  const FactoryImpl = await ethers.getContractFactory("AlgebraUpgradeablePluginFactory");
  const factoryImpl = await FactoryImpl.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log("FactoryImplementation:", factoryImplAddress);
  console.log("");

  // ============= 3. DEPLOY FACTORY PROXY =============
  console.log("=== Deploying Factory Proxy ===");

  // The proxy deploys its own ProxyAdmin, owned by the deployer, and initializes in its constructor,
  // so no one can initialize it first. The plugin implementation needs the proxy address, so the
  // beacon starts on the factory implementation and is moved to the plugin in step 5.
  const initData = FactoryImpl.interface.encodeFunctionData("initialize", [
    config.algebraFactory,
    factoryImplAddress,
    config.defaultFeeConfig,
  ]);

  const TransparentProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const factoryProxy = await TransparentProxy.deploy(factoryImplAddress, deployer.address, initData);
  await factoryProxy.waitForDeployment();
  const factoryProxyAddress = await factoryProxy.getAddress();
  console.log("FactoryProxy:", factoryProxyAddress);

  const adminWord = await ethers.provider.getStorage(factoryProxyAddress, PROXY_ADMIN_SLOT);
  const proxyAdminAddress = ethers.getAddress(ethers.dataSlice(adminWord, 12));
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("");

  // ============= 4. DEPLOY PLUGIN IMPLEMENTATION =============
  console.log("=== Deploying Plugin Implementation ===");

  const PluginImpl = await ethers.getContractFactory("AlgebraUpgradeablePlugin");
  const pluginImpl = await PluginImpl.deploy(
    config.algebraFactory,
    factoryProxyAddress,
    await volatilityOracleImpl.getAddress(),
    await dynamicFeeImpl.getAddress(),
    await farmingProxyImpl.getAddress(),
    await almImpl.getAddress(),
    await securityImpl.getAddress()
  );
  await pluginImpl.waitForDeployment();
  const pluginImplAddress = await pluginImpl.getAddress();
  console.log("PluginImplementation:", pluginImplAddress);
  console.log("");

  // ============= 5. POINT THE BEACON AT THE PLUGIN =============
  console.log("=== Setting Plugin Implementation ===");

  const factory = await ethers.getContractAt("AlgebraUpgradeablePluginFactory", factoryProxyAddress);
  const upgradeTx = await factory.upgradePlugins(pluginImplAddress);
  await upgradeTx.wait();
  console.log("Beacon implementation:", pluginImplAddress);
  console.log("");

  // ============= 6. DEPLOY AUXILIARY CONTRACTS =============
  console.log("=== Deploying Auxiliary Contracts ===");

  const SecurityRegistryFactory = await ethers.getContractFactory("SecurityRegistry");
  const securityRegistry = await SecurityRegistryFactory.deploy(config.algebraFactory);
  await securityRegistry.waitForDeployment();
  console.log("SecurityRegistry:", await securityRegistry.getAddress());


  // ============= 7. POST-DEPLOYMENT CONFIGURATION =============
  console.log("=== Post-Deployment Configuration ===");

  // Set farming address
  if (config.farmingCenter !== ZERO_ADDRESS) {
    const tx1 = await factory.setFarmingAddress(config.farmingCenter);
    await tx1.wait();
    console.log("Set farming address:", config.farmingCenter);
  }

  // Set SecurityRegistry
  const tx2 = await factory.setSecurityRegistry(await securityRegistry.getAddress());
  await tx2.wait();
  console.log("Set SecurityRegistry");



  // Set DefaultPluginFactory in AlgebraFactory
  const algebraFactory = await ethers.getContractAt("IAlgebraFactory", config.algebraFactory);
  const tx9 = await algebraFactory.setDefaultPluginFactory(factoryProxyAddress);
  await tx9.wait();
  console.log("Set DefaultPluginFactory in AlgebraFactory");
  console.log("");

  // ============= SUMMARY =============
  console.log("========================================");
  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log("========================================");
  console.log("");
  console.log("Factory (proxy):", factoryProxyAddress);
  console.log("Factory (impl):", factoryImplAddress);
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("Plugin (impl):", pluginImplAddress);
  console.log("");
  console.log("--- Module Implementations ---");
  console.log("VolatilityOracle:", await volatilityOracleImpl.getAddress());
  console.log("DynamicFee:", await dynamicFeeImpl.getAddress());
  console.log("FarmingProxy:", await farmingProxyImpl.getAddress());
  console.log("ALM:", await almImpl.getAddress());
  console.log("Security:", await securityImpl.getAddress());
  console.log("");
  console.log("--- Auxiliary ---");
  console.log("SecurityRegistry:", await securityRegistry.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
