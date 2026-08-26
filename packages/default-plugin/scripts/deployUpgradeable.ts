import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const config = {
  // Algebra Core Factory address
  algebraFactory: ZERO_ADDRESS,

  // Farming center address (optional, can be set later)
  farmingCenter: ZERO_ADDRESS,

  // Allowlist Checker Registry address for the Permissioned Pool module
  // (optional, deploy via permissioned-pools/scripts/deployAllowlistChecker.ts and set here, or later via setAllowlistCheckerRegistry)
  allowlistCheckerRegistry: ZERO_ADDRESS,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  if (config.algebraFactory === ZERO_ADDRESS) {
    throw new Error("Set config.algebraFactory before deploying");
  }

  // ============= 1. DEPLOY MODULE IMPLEMENTATIONS =============
  console.log("=== Deploying Module Implementations ===");

  const VolatilityOracleImpl = await ethers.getContractFactory("VolatilityOraclePluginImplementation");
  const volatilityOracleImpl = await VolatilityOracleImpl.deploy();
  await volatilityOracleImpl.waitForDeployment();
  console.log("VolatilityOracleImpl:", await volatilityOracleImpl.getAddress());

  const FarmingProxyImpl = await ethers.getContractFactory("FarmingProxyPluginImplementation");
  const farmingProxyImpl = await FarmingProxyImpl.deploy();
  await farmingProxyImpl.waitForDeployment();
  console.log("FarmingProxyImpl:", await farmingProxyImpl.getAddress());

  const SecurityImpl = await ethers.getContractFactory("SecurityPluginImplementation");
  const securityImpl = await SecurityImpl.deploy();
  await securityImpl.waitForDeployment();
  console.log("SecurityImpl:", await securityImpl.getAddress());

  const PriceConvergenceImpl = await ethers.getContractFactory("PriceConvergencePluginImplementation");
  const priceConvergenceImpl = await PriceConvergenceImpl.deploy();
  await priceConvergenceImpl.waitForDeployment();
  console.log("PriceConvergenceImpl:", await priceConvergenceImpl.getAddress());

  const PermissionedPoolImpl = await ethers.getContractFactory("PermissionedPoolPluginImplementation");
  const permissionedPoolImpl = await PermissionedPoolImpl.deploy();
  await permissionedPoolImpl.waitForDeployment();
  console.log("PermissionedPoolImpl:", await permissionedPoolImpl.getAddress());


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
    await farmingProxyImpl.getAddress(),
    await securityImpl.getAddress(),
    await priceConvergenceImpl.getAddress(),
    await permissionedPoolImpl.getAddress()
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
  console.log("Set SecurityRegistry");

  // Set AllowlistCheckerRegistry (deploy separately via permissioned-pools/scripts/deployAllowlistChecker.ts first)
  if (config.allowlistCheckerRegistry !== ZERO_ADDRESS) {
    const tx3 = await factory.setAllowlistCheckerRegistry(config.allowlistCheckerRegistry);
    await tx3.wait();
    console.log("Set AllowlistCheckerRegistry:", config.allowlistCheckerRegistry);
  }

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
  console.log("FarmingProxy:", await farmingProxyImpl.getAddress());
  console.log("Security:", await securityImpl.getAddress());
  console.log("PriceConvergence:", await priceConvergenceImpl.getAddress());
  console.log("PermissionedPool:", await permissionedPoolImpl.getAddress());
  console.log("");
  console.log("--- Auxiliary ---");
  console.log("SecurityRegistry:", await securityRegistry.getAddress());
  console.log("");
  console.log("Note: AllowlistCheckerRegistry is deployed separately - see");
  console.log("permissioned-pools/scripts/deployAllowlistChecker.ts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
