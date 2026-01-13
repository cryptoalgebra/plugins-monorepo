// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x51a744E9FEdb15842c3080d0937C99A365C6c358",
  
  // Farming center address (optional, can be set later)
  farmingCenter: "0x3aA96eDb755C44F3E50C5408a36abb52f28326Ba",
  
  // Security registry address (optional, can be set later)
  securityRegistry: "0x0000000000000000000000000000000000000000",
  
  // Default fee configuration for dynamic fee module
  defaultFeeConfig: {
    alpha1: 2900,
    alpha2: 12000,
    beta1: 360,
    beta2: 60000,
    gamma1: 59,
    gamma2: 8500,
    baseFee: 100
  }
};

// ============= MODULE IMPLEMENTATIONS =============
// Deploy all module implementation contracts

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

// ============= PROXY ADMIN =============

const ProxyAdminModule = buildModule("ProxyAdmin", (m) => {
  const proxyAdmin = m.contract("ProxyAdmin", [], {
    id: "ProxyAdmin"
  });

  return { proxyAdmin };
});

// ============= FACTORY IMPLEMENTATION =============

const FactoryImplementationModule = buildModule("FactoryImplementation", (m) => {
  // Deploy factory implementation (for Transparent Proxy)
  const factoryImpl = m.contract("AlgebraUpgradeablePluginFactory", [], {
    id: "FactoryImplementation"
  });

  return { factoryImpl };
});

// ============= FACTORY PROXY =============

const FactoryProxyModule = buildModule("FactoryProxy", (m) => {
  const { proxyAdmin } = m.useModule(ProxyAdminModule);

  // Deploy TransparentUpgradeableProxy
  // We use ProxyAdmin as a placeholder 
  // The proxy is later upgraded to the real factory implementation and initialized
  // via ProxyAdmin.upgradeAndCall.
  const factoryProxy = m.contract("TransparentUpgradeableProxy", [
    proxyAdmin,
    proxyAdmin,
    "0x"
  ], {
    id: "FactoryProxy"
  });

  return { factoryProxy };
});

// ============= PLUGIN IMPLEMENTATION =============

const PluginImplementationModule = buildModule("PluginImplementation", (m) => {
  const { 
    volatilityOracleImpl, 
    dynamicFeeImpl, 
    farmingProxyImpl, 
    almImpl, 
    securityImpl 
  } = m.useModule(ModuleImplementationsModule);
  const { factoryProxy } = m.useModule(FactoryProxyModule);

  const pluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    factoryProxy,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  ], {
    id: "PluginImplementation"
  });

  return { 
    pluginImpl,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  };
});

// ============= MAIN DEPLOYMENT =============

export default buildModule("AlgebraUpgradeablePluginFactoryDeployment", (m) => {
  // 1. Deploy all module implementations first
  const moduleImpls = m.useModule(ModuleImplementationsModule);
  
  // 2. Deploy ProxyAdmin
  const { proxyAdmin } = m.useModule(ProxyAdminModule);

  // 3. Deploy factory proxy (placeholder implementation)
  const { factoryProxy } = m.useModule(FactoryProxyModule);
  
  // 4. Deploy plugin implementation (needs factoryProxy address)
  const { pluginImpl } = m.useModule(PluginImplementationModule);

  // 5. Deploy factory implementation
  const { factoryImpl } = m.useModule(FactoryImplementationModule);

  // 6. Upgrade proxy to the real implementation and initialize it in one tx
  const initData = m.encodeFunctionCall(factoryImpl, "initialize", [
    config.algebraFactory,
    pluginImpl,
    config.defaultFeeConfig
  ], {
    id: "FactoryInitData"
  });

  const upgradeAndInitialize = m.call(proxyAdmin, "upgradeAndCall", [
    factoryProxy,
    factoryImpl,
    initData
  ], {
    id: "UpgradeAndInitializeFactory"
  });

  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", factoryProxy, {
    id: "Factory",
    after: [upgradeAndInitialize]
  });

  // ============= POST-DEPLOYMENT CONFIGURATION =============

  // Set farming address if provided
  if (config.farmingCenter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setFarmingAddress", [config.farmingCenter], {
      id: "SetFarmingAddress",
      after: [upgradeAndInitialize]
    });
  }

  // Set security registry if provided
  if (config.securityRegistry !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setSecurityRegistry", [config.securityRegistry], {
      id: "SetSecurityRegistry",
      after: [upgradeAndInitialize]
    });
  }

  return {
    factory,
    factoryImpl,
    factoryProxy,
    ...m.useModule(PluginImplementationModule)
  };
});
