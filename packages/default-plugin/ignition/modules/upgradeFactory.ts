// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses from your initial deployment

const config = {
  // Factory proxy address from initial deployment
  factoryProxyAddress: "0x0000000000000000000000000000000000000000",
  
  // ProxyAdmin the factory proxy deployed, printed by the initial deployment
  proxyAdminAddress: "0x0000000000000000000000000000000000000000",
};

// ============= FACTORY UPGRADE MODULE =============
// Use this module to upgrade the factory implementation to a new version
// Only for a factory deployed from this version. On an earlier deployment the new factory would
// build proxies with the pool at offset 56, while the beacon still serves a plugin that reads 75,
// so the hooks of every pool created after the upgrade would revert with OnlyPool()
//
// Usage:
//   1. Update addresses in config above
//   2. Run: npx hardhat ignition deploy ignition/modules/upgradeFactory.ts --network baseTestnet

export default buildModule("UpgradeFactory", (m) => {
  
  // Deploy new factory implementation
  const newFactoryImpl = m.contract("AlgebraUpgradeablePluginFactory", [], {
    id: "NewFactoryImplementation"
  });

  // Get ProxyAdmin instance
  const proxyAdmin = m.contractAt("ProxyAdmin", config.proxyAdminAddress, {
    id: "ProxyAdmin"
  });

  // Upgrade to new implementation via ProxyAdmin
  // Using upgradeAndCall with empty data (no reinitialization needed for upgrades)
  m.call(proxyAdmin, "upgradeAndCall", [
    config.factoryProxyAddress, 
    newFactoryImpl, 
    "0x" // Empty calldata - no reinitialization
  ], {
    id: "UpgradeFactoryImplementation"
  });

  return { newFactoryImpl, proxyAdmin };
});
