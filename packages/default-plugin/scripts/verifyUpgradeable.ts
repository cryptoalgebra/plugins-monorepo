import hre from "hardhat";

// ============= FILL IN DEPLOYED ADDRESSES =============
// Paste addresses from deployment output

const deployed = {
  volatilityOracleImpl: "0x2fe01f9c672d24D2d4315d2bA980B141B0159489",
  farmingProxyImpl: "0xA9C02F398B3da32FEbb634Ec4d1ca01d2B1D400a",
  securityImpl: "0xF2738e308b9BDc6475e375ad5dd50517B6Df9009",
  priceConvergenceImpl: "0xe34ee083B4154F2624ECCb9A80E188b83944c2d5",
  proxyAdmin: "0x16d379f3458bf6DBF6A0dbC5696Be4ab9137cfd4",
  factoryProxy: "0xc27754e939213fab4f68A5B4E75adf9568174355",
  pluginImpl: "0x9F068C81ab7743EA7B2D48C0FecEAdaFcAD2c95C",
  factoryImpl: "0xfAdEDf704A02B91bB2bb387D1e03F18Cb5f235Ef",
  securityRegistry: "0x3f912b39A89708Db8E10205421d3726e2DF4984D",
};

// ============= SAME CONFIG AS DEPLOY SCRIPT =============
const config = {
  algebraFactory: "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04",
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
    ["FarmingProxyPluginImplementation", deployed.farmingProxyImpl],
    ["SecurityPluginImplementation", deployed.securityImpl],
    ["PriceConvergencePluginImplementation", deployed.priceConvergenceImpl],
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
    deployed.volatilityOracleImpl,
    deployed.farmingProxyImpl,
    deployed.securityImpl,
    deployed.priceConvergenceImpl,
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
