import { ethers } from "hardhat";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address (used for role checks)
  algebraFactory: "0x53400eD24c77515397fC3A559fF1363DaB81B5c7",

  // AlgebraCustomPoolEntryPoint address (from integral-periphery).
  // Must already hold CUSTOM_POOL_DEPLOYER and POOLS_ADMINISTRATOR roles in the AlgebraFactory.
  entryPoint: "0xF313056d11BBde96D8447CFe7b95a60B25B6Cc3E",

  // Farming center address (optional, can be set later)
  farmingCenter: "0x4c9d82605335cE015D95453c8F20FCf2cecC29C1",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// This script fires off many deploys/transactions back to back; some RPC providers (delegated
// accounts, relayers) cap how many can be in flight at once, so give each one a moment to
// actually confirm before sending the next.
const DEPLOY_CONFIRMATIONS = 1;
const DEPLOY_TX_DELAY_MS = 5_000;

type TxLike = { wait: (confirmations?: number) => Promise<unknown> };
type Deployable = {
  waitForDeployment: () => Promise<unknown>;
  deploymentTransaction?: () => TxLike | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeployment(contract: Deployable) {
  const tx = contract.deploymentTransaction?.();
  if (tx) {
    await tx.wait(DEPLOY_CONFIRMATIONS);
  } else {
    await contract.waitForDeployment();
  }
  if (DEPLOY_TX_DELAY_MS > 0) await sleep(DEPLOY_TX_DELAY_MS);
}

async function waitForTx(tx: TxLike) {
  await tx.wait(DEPLOY_CONFIRMATIONS);
  if (DEPLOY_TX_DELAY_MS > 0) await sleep(DEPLOY_TX_DELAY_MS);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("");

  if (config.algebraFactory === ZERO_ADDRESS || config.entryPoint === ZERO_ADDRESS) {
    throw new Error("Set config.algebraFactory and config.entryPoint before deploying");
  }

  // ============= 1. DEPLOY MODULE IMPLEMENTATIONS =============
  console.log("=== Deploying Module Implementations ===");

  const VolatilityOracleImpl = await ethers.getContractFactory("VolatilityOraclePluginImplementation");
  const volatilityOracleImpl = await VolatilityOracleImpl.deploy();
  await waitForDeployment(volatilityOracleImpl);
  console.log("VolatilityOracleImpl:", await volatilityOracleImpl.getAddress());

  const FarmingProxyImpl = await ethers.getContractFactory("FarmingProxyPluginImplementation");
  const farmingProxyImpl = await FarmingProxyImpl.deploy();
  await waitForDeployment(farmingProxyImpl);
  console.log("FarmingProxyImpl:", await farmingProxyImpl.getAddress());

  const SecurityImpl = await ethers.getContractFactory("SecurityPluginImplementation");
  const securityImpl = await SecurityImpl.deploy();
  await waitForDeployment(securityImpl);
  console.log("SecurityImpl:", await securityImpl.getAddress());

  const PriceConvergenceImpl = await ethers.getContractFactory("PriceConvergencePluginImplementation");
  const priceConvergenceImpl = await PriceConvergenceImpl.deploy();
  await waitForDeployment(priceConvergenceImpl);
  console.log("PriceConvergenceImpl:", await priceConvergenceImpl.getAddress());
  console.log("");

  // ============= 2. DEPLOY PROXY ADMIN =============
  console.log("=== Deploying ProxyAdmin ===");

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await waitForDeployment(proxyAdmin);
  const proxyAdminAddress = await proxyAdmin.getAddress();
  console.log("ProxyAdmin:", proxyAdminAddress);
  console.log("");

  // ============= 3. DEPLOY FACTORY PROXY (placeholder) =============
  console.log("=== Deploying Factory Proxy ===");

  const TransparentProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  // ProxyAdmin is used as a placeholder implementation; the proxy is upgraded to the real
  // factory implementation and initialized via ProxyAdmin.upgradeAndCall below.
  const factoryProxy = await TransparentProxy.deploy(proxyAdminAddress, proxyAdminAddress, "0x");
  await waitForDeployment(factoryProxy);
  const factoryProxyAddress = await factoryProxy.getAddress();
  console.log("FactoryProxy:", factoryProxyAddress);
  console.log("");

  // ============= 4. DEPLOY PLUGIN IMPLEMENTATION =============
  console.log("=== Deploying Plugin Implementation ===");

  // pluginFactory is bound to the proxy address (known before initialization).
  const PluginImpl = await ethers.getContractFactory("AlgebraUpgradeablePlugin");
  const pluginImpl = await PluginImpl.deploy(
    config.algebraFactory,
    factoryProxyAddress,
    await volatilityOracleImpl.getAddress(),
    await farmingProxyImpl.getAddress(),
    await securityImpl.getAddress(),
    await priceConvergenceImpl.getAddress()
  );
  await waitForDeployment(pluginImpl);
  const pluginImplAddress = await pluginImpl.getAddress();
  console.log("PluginImplementation:", pluginImplAddress);
  console.log("");

  // ============= 5. DEPLOY FACTORY IMPLEMENTATION =============
  console.log("=== Deploying Custom Factory Implementation ===");

  const FactoryImpl = await ethers.getContractFactory("AlgebraCustomPluginFactory");
  const factoryImpl = await FactoryImpl.deploy();
  await waitForDeployment(factoryImpl);
  const factoryImplAddress = await factoryImpl.getAddress();
  console.log("FactoryImplementation:", factoryImplAddress);
  console.log("");

  // ============= 6. UPGRADE PROXY & INITIALIZE =============
  console.log("=== Upgrading Proxy & Initializing Factory ===");

  const initData = FactoryImpl.interface.encodeFunctionData("initialize", [
    config.algebraFactory,
    config.entryPoint,
    pluginImplAddress,
  ]);

  const tx = await proxyAdmin.upgradeAndCall(factoryProxyAddress, factoryImplAddress, initData);
  await waitForTx(tx);
  console.log("Factory proxy upgraded and initialized");
  console.log("");

  const factory = await ethers.getContractAt("AlgebraCustomPluginFactory", factoryProxyAddress);

  // ============= 7. DEPLOY AUXILIARY CONTRACTS =============
  console.log("=== Deploying Auxiliary Contracts ===");

  const SecurityRegistryFactory = await ethers.getContractFactory("SecurityRegistry");
  const securityRegistry = await SecurityRegistryFactory.deploy(config.algebraFactory);
  await waitForDeployment(securityRegistry);
  console.log("SecurityRegistry:", await securityRegistry.getAddress());
  console.log("");

  // ============= 8. POST-DEPLOYMENT CONFIGURATION =============
  console.log("=== Post-Deployment Configuration ===");

  if (config.farmingCenter !== ZERO_ADDRESS) {
    const tx1 = await factory.setFarmingAddress(config.farmingCenter);
    await waitForTx(tx1);
    console.log("Set farming address:", config.farmingCenter);
  }

  const tx2 = await factory.setSecurityRegistry(await securityRegistry.getAddress());
  await waitForTx(tx2);
  console.log("Set SecurityRegistry");
  console.log("");

  // Note: this is a custom-pool deployer, not the default plugin factory. Pools are created via
  // factory.createCustomPool(...) which routes through the entry point, so there is no
  // setDefaultPluginFactory step. The entry point must already hold the CUSTOM_POOL_DEPLOYER role.

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
  console.log("");
  console.log("--- Module Implementations ---");
  console.log("VolatilityOracle:", await volatilityOracleImpl.getAddress());
  console.log("FarmingProxy:", await farmingProxyImpl.getAddress());
  console.log("Security:", await securityImpl.getAddress());
  console.log("PriceConvergence:", await priceConvergenceImpl.getAddress());
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
