import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // AlgebraCustomPoolEntryPoint address (integral-periphery). The Algebra factory is read from it.
  // The entry point must hold CUSTOM_POOL_DEPLOYER and POOLS_ADMINISTRATOR_ROLE in the AlgebraFactory.
  entryPoint: "0x0000000000000000000000000000000000000000",

  // Farming center address (optional, can be set later)
  farmingCenter: "0x0000000000000000000000000000000000000000",

  // Existing SecurityRegistry for the same AlgebraFactory (optional, a new one is deployed if zero)
  securityRegistry: "0x0000000000000000000000000000000000000000",

  // Module implementations are stateless and reached by delegatecall, so the ones already deployed
  // for the default plugin factory can be reused. Any zero address is deployed fresh.
  moduleImplementations: {
    volatilityOracle: "0x0000000000000000000000000000000000000000",
    dynamicFee: "0x0000000000000000000000000000000000000000",
    farmingProxy: "0x0000000000000000000000000000000000000000",
    alm: "0x0000000000000000000000000000000000000000",
    security: "0x0000000000000000000000000000000000000000",
  },

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

const MODULE_CONTRACTS = {
  volatilityOracle: "VolatilityOraclePluginImplementation",
  dynamicFee: "DynamicFeePluginImplementation",
  farmingProxy: "FarmingProxyPluginImplementation",
  alm: "AlmPluginImplementation",
  security: "SecurityPluginImplementation",
} as const;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  if (config.entryPoint === ZERO_ADDRESS) {
    throw new Error("Set config.entryPoint before deploying");
  }

  const entryPoint = await ethers.getContractAt("IAlgebraCustomPoolEntryPoint", config.entryPoint);
  const algebraFactoryAddress = await entryPoint.factory();
  const algebraFactory = await ethers.getContractAt("IAlgebraFactory", algebraFactoryAddress);
  console.log("AlgebraFactory (from entry point):", algebraFactoryAddress);

  // The configuration steps need the administrator role, so refuse before deploying anything
  const administratorRole = ethers.id("ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR");
  if (!(await algebraFactory.hasRoleOrOwner(administratorRole, deployer.address))) {
    throw new Error("Deployer is neither the AlgebraFactory owner nor an ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR");
  }

  // Without these roles the entry point cannot create or manage custom pools
  const missingRoles: string[] = [];
  if (!(await algebraFactory.hasRoleOrOwner(await algebraFactory.CUSTOM_POOL_DEPLOYER(), config.entryPoint))) missingRoles.push("CUSTOM_POOL_DEPLOYER");
  if (!(await algebraFactory.hasRoleOrOwner(await algebraFactory.POOLS_ADMINISTRATOR_ROLE(), config.entryPoint))) missingRoles.push("POOLS_ADMINISTRATOR_ROLE");
  if (missingRoles.length) {
    console.warn(`WARNING: entry point lacks ${missingRoles.join(", ")} in the AlgebraFactory, grant before creating pools`);
  }
  console.log("");

  // ============= 1. MODULE IMPLEMENTATIONS =============
  console.log("=== Module Implementations ===");

  const modules = {} as Record<keyof typeof MODULE_CONTRACTS, string>;
  for (const [module, contractName] of Object.entries(MODULE_CONTRACTS) as [keyof typeof MODULE_CONTRACTS, string][]) {
    const existing = config.moduleImplementations[module];
    if (existing !== ZERO_ADDRESS) {
      modules[module] = existing;
      console.log(`${contractName} (reused):`, existing);
      continue;
    }
    const impl = await (await ethers.getContractFactory(contractName)).deploy();
    await impl.waitForDeployment();
    modules[module] = await impl.getAddress();
    console.log(`${contractName}:`, modules[module]);
  }
  console.log("");

  // ============= 2. DEPLOY FACTORY IMPLEMENTATION =============
  console.log("=== Deploying Custom Factory Implementation ===");

  const FactoryImpl = await ethers.getContractFactory("AlgebraCustomPluginFactory");
  const factoryImpl = await FactoryImpl.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log("FactoryImplementation:", factoryImplAddress);
  console.log("");

  // ============= 3. DEPLOY FACTORY PROXY =============
  console.log("=== Deploying Factory Proxy ===");

  // The proxy deploys its own ProxyAdmin, owned by the deployer, and initializes in its constructor,
  // so no one can initialize it first. The plugin implementation needs the proxy address, so the
  // beacon starts on the factory implementation and is moved to the plugin in step 7.
  const initData = FactoryImpl.interface.encodeFunctionData("initialize", [
    config.entryPoint,
    factoryImplAddress,
    config.defaultFeeConfig,
  ]);

  const TransparentProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const factoryProxy = await TransparentProxy.deploy(factoryImplAddress, deployer.address, initData);
  await factoryProxy.waitForDeployment();
  const factoryProxyAddress = await factoryProxy.getAddress();
  console.log("FactoryProxy:", factoryProxyAddress);

  const proxyReceipt = await factoryProxy.deploymentTransaction()!.wait();
  const adminChanged = proxyReceipt!.logs
    .map((log) => TransparentProxy.interface.parseLog(log))
    .find((event) => event?.name === "AdminChanged");
  const proxyAdminAddress: string = adminChanged!.args.newAdmin;
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("");

  // ============= 4. DEPLOY PLUGIN IMPLEMENTATION =============
  console.log("=== Deploying Plugin Implementation ===");

  // pluginFactory is an immutable, so this implementation serves only this custom factory
  const PluginImpl = await ethers.getContractFactory("AlgebraUpgradeablePlugin");
  const pluginImpl = await PluginImpl.deploy(
    algebraFactoryAddress,
    factoryProxyAddress,
    modules.volatilityOracle,
    modules.dynamicFee,
    modules.farmingProxy,
    modules.alm,
    modules.security
  );
  await pluginImpl.waitForDeployment();
  const pluginImplAddress = await pluginImpl.getAddress();
  console.log("PluginImplementation:", pluginImplAddress);
  console.log("");

  // ============= 5. SECURITY REGISTRY =============
  console.log("=== Security Registry ===");

  let securityRegistryAddress = config.securityRegistry;
  if (securityRegistryAddress === ZERO_ADDRESS) {
    const securityRegistry = await (await ethers.getContractFactory("SecurityRegistry")).deploy(algebraFactoryAddress);
    await securityRegistry.waitForDeployment();
    securityRegistryAddress = await securityRegistry.getAddress();
    console.log("SecurityRegistry:", securityRegistryAddress);
  } else {
    console.log("SecurityRegistry (reused):", securityRegistryAddress);
  }
  console.log("");

  // ============= 6. FACTORY CONFIGURATION =============
  console.log("=== Factory Configuration ===");

  // Plugins copy these at creation, so they are set before step 7 opens pool creation
  const factory = await ethers.getContractAt("AlgebraCustomPluginFactory", factoryProxyAddress);

  if (config.farmingCenter !== ZERO_ADDRESS) {
    await (await factory.setFarmingAddress(config.farmingCenter)).wait();
    console.log("Set farming address:", config.farmingCenter);
  }

  await (await factory.setSecurityRegistry(securityRegistryAddress)).wait();
  console.log("Set SecurityRegistry");
  console.log("");

  // ============= 7. POINT THE BEACON AT THE PLUGIN =============
  console.log("=== Setting Plugin Implementation ===");

  // Last on purpose. While the beacon still points at the factory implementation, a new plugin's
  // initialize call has nothing to land on, so createCustomPool reverts and no pool can be created
  // with an unconfigured plugin.
  await (await factory.upgradePlugins(pluginImplAddress)).wait();
  console.log("Beacon implementation:", pluginImplAddress);
  console.log("");

  // This is a custom pool deployer, not the default plugin factory, so there is no setDefaultPluginFactory step.
  // Pools are created with factory.createCustomPool(creator, tokenA, tokenB, data), which goes through the entry point.

  // ============= SUMMARY =============
  console.log("========================================");
  console.log("=== DEPLOYMENT COMPLETE ===");
  console.log("========================================");
  console.log("");
  console.log("CustomFactory (proxy):", factoryProxyAddress);
  console.log("CustomFactory (impl):", factoryImplAddress);
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("Plugin (impl):", pluginImplAddress);
  console.log("EntryPoint:", config.entryPoint);
  console.log("AlgebraFactory:", algebraFactoryAddress);
  console.log("");
  console.log("--- Module Implementations ---");
  for (const [module, address] of Object.entries(modules)) console.log(`${module}:`, address);
  console.log("");
  console.log("--- Auxiliary ---");
  console.log("SecurityRegistry:", securityRegistryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
