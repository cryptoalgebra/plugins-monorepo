import hre from "hardhat";

// ============= FILL IN DEPLOYED ADDRESSES =============
// Paste addresses from deployment output

const deployed = {
  volatilityOracleImpl: "",
  dynamicFeeImpl: "",
  farmingProxyImpl: "",
  almImpl: "",
  securityImpl: "",
  mevxImpl: "",
  feeDiscountImpl: "",
  limitOrderImpl: "",
  slidingFeeImpl: "",
  proxyAdmin: "",
  factoryProxy: "",
  pluginImpl: "",
  factoryImpl: "",
  securityRegistry: "",
  feeDiscountRegistry: "",
  limitOrderManager: "",
};

// ============= SAME CONFIG AS DEPLOY SCRIPT =============
const config = {
  algebraFactory: "0x51a744E9FEdb15842c3080d0937C99A365C6c358",
  poolDeployer: "0x0000000000000000000000000000000000000000",
  wNativeToken: "0x0000000000000000000000000000000000000000",
};

async function verify(name: string, address: string, constructorArguments: any[]) {
  if (!address) {
    console.log(`⏭  Skipping ${name} — address not set`);
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
    ["MevxPluginImplementation", deployed.mevxImpl],
    ["FeeDiscountPluginImplementation", deployed.feeDiscountImpl],
    ["LimitOrderPluginImplementation", deployed.limitOrderImpl],
    ["SlidingFeePluginImplementation", deployed.slidingFeeImpl],
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
    [
      deployed.volatilityOracleImpl,
      deployed.dynamicFeeImpl,
      deployed.farmingProxyImpl,
      deployed.almImpl,
      deployed.securityImpl,
      deployed.mevxImpl,
      deployed.feeDiscountImpl,
      deployed.limitOrderImpl,
      deployed.slidingFeeImpl,
    ],
  ]);

  // 4. SecurityRegistry
  await verify("SecurityRegistry", deployed.securityRegistry, [config.algebraFactory]);

  // 5. FeeDiscountRegistry
  await verify("FeeDiscountRegistry", deployed.feeDiscountRegistry, [config.algebraFactory]);

  // 6. LimitOrderManager
  await verify("LimitOrderManager", deployed.limitOrderManager, [
    config.wNativeToken,
    config.poolDeployer,
    deployed.factoryProxy,
    config.algebraFactory,
  ]);

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
