// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses from your deployment

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E",
  
  // Factory proxy address from initial deployment
  factoryProxyAddress: "0x0000000000000000000000000000000000000000",
};

// ============= MODULE IMPLEMENTATIONS =============
// Deploy fresh module implementations for the new plugin version

const ModuleImplementationsModule = buildModule("ModuleImplementations", (m) => {
  // Deploy VolatilityOracle module
  const volatilityOracleImpl = m.contract("VolatilityOracle", [], {
    id: "VolatilityOracleImplementation"
  });

  // Deploy DynamicFee module
  const dynamicFeeImpl = m.contract("DynamicFeeManager", [], {
    id: "DynamicFeeImplementation"
  });

  // Deploy FarmingProxy module
  const farmingProxyImpl = m.contract("FarmingProxy", [], {
    id: "FarmingProxyImplementation"
  });

  // Deploy ALM module
  const almImpl = m.contract("AlmModule", [], {
    id: "AlmImplementation"
  });

  // Deploy Security module
  const securityImpl = m.contract("SecurityModule", [], {
    id: "SecurityImplementation"
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
//
// Usage:
//   1. Update factoryProxyAddress in config above
//   2. Run: npx hardhat ignition deploy ignition/modules/upgradePlugins.ts --network baseSepolia

export default buildModule("UpgradePlugins", (m) => {
  
  // Deploy new module implementations
  const { 
    volatilityOracleImpl, 
    dynamicFeeImpl, 
    farmingProxyImpl, 
    almImpl, 
    securityImpl 
  } = m.useModule(ModuleImplementationsModule);

  // Deploy new plugin implementation
  const newPluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    config.factoryProxyAddress,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  ], {
    id: "NewPluginImplementation"
  });

  // Get factory instance at proxy address
  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", config.factoryProxyAddress, {
    id: "FactoryForPluginUpgrade"
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
