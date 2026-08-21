import hre from "hardhat";

// ============= FILL IN DEPLOYED ADDRESSES =============
// Paste addresses from deployment output

const deployed = {
  volatilityOracleImpl: "0x000000000000000000000000000000000000000000",
  dynamicFeeImpl: "0x000000000000000000000000000000000000000000",
  farmingProxyImpl: "0x000000000000000000000000000000000000000000",
  almImpl: "0x000000000000000000000000000000000000000000",
  securityImpl: "0x000000000000000000000000000000000000000000",
  proxyAdmin: "0x000000000000000000000000000000000000000000",
  factoryProxy: "0x000000000000000000000000000000000000000000",
  pluginImpl: "0x000000000000000000000000000000000000000000",
  factoryImpl: "0x000000000000000000000000000000000000000000",
  securityRegistry: "0x000000000000000000000000000000000000000000",
};

// ============= SAME CONFIG AS DEPLOY SCRIPT =============
const config = {
  algebraFactory: "0x000000000000000000000000000000000000000000",
};

async function verify(name: string, address: string, constructorArguments: any[]) {
  if (!address) {
    console.log(`⏭  Skipping ${name} - address not set`);
    return;
  }
  console.log(`🔍 Verifying ${name} at ${address}...`);
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`✅ ${name} verified`);
  } catch (e: any) {
    if (e.message?.includes("Already Verified") || e.message?.includes("already verified")) {
      console.log(`✅ ${name} already verified`);
    } else {
      console.log(`❌ ${name} verification failed:`, e.message);
    }
  }
}

async function main() {
  console.log("========================================");
  console.log("=== CONTRACT VERIFICATION ===");
  console.log("========================================\n");

  // 1. Module implementations (no constructor args)
  const noArgContracts = [
    ["VolatilityOraclePluginImplementation", deployed.volatilityOracleImpl],
    ["DynamicFeePluginImplementation", deployed.dynamicFeeImpl],
    ["FarmingProxyPluginImplementation", deployed.farmingProxyImpl],
    ["AlmPluginImplementation", deployed.almImpl],
    ["SecurityPluginImplementation", deployed.securityImpl],
    ["ProxyAdmin", deployed.proxyAdmin],
    ["AlgebraUpgradeablePluginFactory", deployed.factoryImpl],
  ] as const;

  for (const [name, address] of noArgContracts) {
    await verify(name, address, []);
  }

  // 2. TransparentUpgradeableProxy
  await verify("TransparentUpgradeableProxy (FactoryProxy)", deployed.factoryProxy, [
    deployed.proxyAdmin,
    deployed.proxyAdmin,
    "0x",
  ]);

  // 3. AlgebraUpgradeablePlugin
  await verify("AlgebraUpgradeablePlugin", deployed.pluginImpl, [
    config.algebraFactory,
    deployed.factoryProxy,
    {
      volatilityOracle: deployed.volatilityOracleImpl,
      dynamicFee: deployed.dynamicFeeImpl,
      farmingProxy: deployed.farmingProxyImpl,
      alm: deployed.almImpl,
      security: deployed.securityImpl,
    },
  ]);

  // 4. SecurityRegistry
  await verify("SecurityRegistry", deployed.securityRegistry, [config.algebraFactory]);


  console.log("\n========================================");
  console.log("=== VERIFICATION COMPLETE ===");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
