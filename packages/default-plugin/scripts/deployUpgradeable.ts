import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x285C74f3d01296F96c5d3858ab482f707e8Bfdfc",

  // Farming center address (optional, can be set later)
  farmingCenter: "0x92E4eaCD3b49fa85D13E4B6E8d6bfd0CFafaeD75",

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

  // Default trading hours configuration, applied to every newly created pool - pool admins can
  // still override their own pool's hours/weekdays afterwards via the plugin's own setters
  tradingHours: {
    startSeconds: 9 * 3600, // 09:00 UTC, inclusive
    endSeconds: 18 * 3600, // 18:00 UTC, exclusive
    dayOfWeekOffsetSeconds: 0, // only affects which UTC day counts as local Sat/Sun
    blockedWeekdaysMask: 0x41, // bit 0 = Sunday, bit 6 = Saturday
    enabled: true,
  },

};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

  const TradingHoursImpl = await ethers.getContractFactory("TradingHoursPluginImplementation");
  const tradingHoursImpl = await TradingHoursImpl.deploy();
  await tradingHoursImpl.waitForDeployment();
  console.log("TradingHoursImpl:", await tradingHoursImpl.getAddress());


  // ============= 2. DEPLOY PROXY ADMIN =============
  console.log("=== Deploying ProxyAdmin ===");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  const proxyAdminAddress = await proxyAdmin.getAddress();
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("");

  // ============= 3. DEPLOY FACTORY PROXY (placeholder) =============
  console.log("=== Deploying Factory Proxy ===");

  const TransparentProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  // Use ProxyAdmin as placeholder implementation, empty init data
  const factoryProxy = await TransparentProxy.deploy(proxyAdminAddress, proxyAdminAddress, "0x");
  await factoryProxy.waitForDeployment();
  const factoryProxyAddress = await factoryProxy.getAddress();
  console.log("FactoryProxy:", factoryProxyAddress);
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
    await securityImpl.getAddress(),
    await tradingHoursImpl.getAddress()
  );
  await pluginImpl.waitForDeployment();
  const pluginImplAddress = await pluginImpl.getAddress();
  console.log("PluginImplementation:", pluginImplAddress);
  console.log("");

  // ============= 5. DEPLOY FACTORY IMPLEMENTATION =============
  console.log("=== Deploying Factory Implementation ===");

  const FactoryImpl = await ethers.getContractFactory("AlgebraUpgradeablePluginFactory");
  const factoryImpl = await FactoryImpl.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log("FactoryImplementation:", factoryImplAddress);
  console.log("");

  // ============= 6. UPGRADE PROXY & INITIALIZE =============
  console.log("=== Upgrading Proxy & Initializing Factory ===");

  // Encode initialize calldata
  const factoryInterface = FactoryImpl.interface;
  const initData = factoryInterface.encodeFunctionData("initialize", [
    config.algebraFactory,
    pluginImplAddress,
    config.defaultFeeConfig,
  ]);

  // upgradeAndCall via ProxyAdmin
  const tx = await proxyAdmin.upgradeAndCall(factoryProxyAddress, factoryImplAddress, initData);
  await tx.wait();
  console.log("Factory proxy upgraded and initialized");
  console.log("");

  // Get factory instance at proxy address
  const factory = await ethers.getContractAt("AlgebraUpgradeablePluginFactory", factoryProxyAddress);

  // ============= 7. DEPLOY AUXILIARY CONTRACTS =============
  console.log("=== Deploying Auxiliary Contracts ===");

  const SecurityRegistryFactory = await ethers.getContractFactory("SecurityRegistry");
  const securityRegistry = await SecurityRegistryFactory.deploy(config.algebraFactory);
  await securityRegistry.waitForDeployment();
  console.log("SecurityRegistry:", await securityRegistry.getAddress());


  // ============= 8. POST-DEPLOYMENT CONFIGURATION =============
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
  console.log("Set SecurityRegistry")

  // Set default trading hours
  const tx3 = await factory.setDefaultTradingHours(
    config.tradingHours.startSeconds,
    config.tradingHours.endSeconds,
    config.tradingHours.dayOfWeekOffsetSeconds,
    config.tradingHours.blockedWeekdaysMask,
    config.tradingHours.enabled
  );
  await tx3.wait();
  console.log("Set default trading hours");

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
  console.log("TradingHours:", await tradingHoursImpl.getAddress());
  console.log("");
  console.log("--- Auxiliary ---");
  console.log("SecurityRegistry:", await securityRegistry.getAddress());
  console.log("");
  console.log("--- Default Trading Hours ---");
  console.log("startSeconds:", config.tradingHours.startSeconds);
  console.log("endSeconds:", config.tradingHours.endSeconds);
  console.log("dayOfWeekOffsetSeconds:", config.tradingHours.dayOfWeekOffsetSeconds);
  console.log("blockedWeekdaysMask:", config.tradingHours.blockedWeekdaysMask);
  console.log("enabled:", config.tradingHours.enabled);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
