// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses from your deployment

const config = {
  // Factory proxy address from initial deployment
  factoryProxyAddress: "0x0000000000000000000000000000000000000000",
};

// ============= MODULE IMPLEMENTATIONS =============
// Deploy fresh module implementations for the new plugin version

const ModuleImplementationsModule = buildModule("ModuleImplementations", (m) => {
  const volatilityOracleImpl = m.contract("VolatilityOraclePluginImplementation", [], {
    id: "VolatilityOracleImpl"
  });

  const dynamicFeeImpl = m.contract("DynamicFeePluginImplementation", [], {
    id: "DynamicFeeImpl"
  });

  const farmingProxyImpl = m.contract("FarmingProxyPluginImplementation", [], {
    id: "FarmingProxyImpl"
  });

  const almImpl = m.contract("AlmPluginImplementation", [], {
    id: "AlmImpl"
  });

  const securityImpl = m.contract("SecurityPluginImplementation", [], {
    id: "SecurityImpl"
  });

  return { 
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  };
});

// ============= PLUGIN UPGRADE MODULE =============
// Use this module to upgrade all plugins to a new implementation
// Only for a factory deployed from this version. Proxies of an earlier deployment keep the pool
// at offset 75, this code reads it at 56, and every hook would revert with OnlyPool()
//
// Usage:
//   1. Update factoryProxyAddress in config above
//   2. Run: npx hardhat ignition deploy ignition/modules/upgradePlugins.ts --network baseTestnet

export default buildModule("UpgradePlugins", (m) => {
  
  // Deploy new module implementations
  const { 
    volatilityOracleImpl, 
    dynamicFeeImpl, 
    farmingProxyImpl, 
    almImpl, 
    securityImpl 
  } = m.useModule(ModuleImplementationsModule);

  // Get factory instance at proxy address
  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", config.factoryProxyAddress, {
    id: "FactoryForPluginUpgrade"
  });

  // The plugin must point at the same Algebra factory as the plugin factory
  const algebraFactory = m.staticCall(factory, "algebraFactory", [], 0, {
    id: "AlgebraFactory"
  });

  // Deploy new plugin implementation
  const newPluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    algebraFactory,
    config.factoryProxyAddress,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  ], {
    id: "NewPluginImplementation"
  });

  // Upgrade all plugins via beacon
  m.call(factory, "upgradePlugins", [newPluginImpl], {
    id: "UpgradeAllPlugins"
  });

  return { 
    newPluginImpl,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  };
});
