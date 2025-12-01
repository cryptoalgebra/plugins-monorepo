import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E",
  
  // Farming center address (optional, can be set later)
  farmingCenter: "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261",
  
  // Security registry address (optional, can be set later)
  securityRegistry: "0x0000000000000000000000000000000000000000",
  
  // Default ALM rebalance manager (optional, can be set later)
  rebalanceManager: "0x0000000000000000000000000000000000000000",
  
  // Default ALM TWAP periods (in seconds)
  slowTwapPeriod: 3600,  // 1 hour
  fastTwapPeriod: 60,    // 1 minute
  
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
// Deploy all 5 module implementation contracts

const ModuleImplementationsModule = buildModule("ModuleImplementations", (m) => {
  // 1. Volatility Oracle Implementation
  const volatilityOracleImpl = m.contract("VolatilityOraclePluginImplementation", [], {
    id: "VolatilityOracleImpl"
  });

  // 2. Dynamic Fee Implementation
  const dynamicFeeImpl = m.contract("DynamicFeePluginImplementation", [], {
    id: "DynamicFeeImpl"
  });

  // 3. Farming Proxy Implementation
  const farmingProxyImpl = m.contract("FarmingProxyPluginImplementation", [], {
    id: "FarmingProxyImpl"
  });

  // 4. ALM Implementation
  const almImpl = m.contract("AlmPluginImplementation", [], {
    id: "AlmImpl"
  });

  // 5. Security Implementation
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

// ============= PLUGIN IMPLEMENTATION =============
// Deploy the main plugin implementation that delegates to modules

const PluginImplementationModule = buildModule("PluginImplementation", (m) => {
  const { 
    volatilityOracleImpl, 
    dynamicFeeImpl, 
    farmingProxyImpl, 
    almImpl, 
    securityImpl 
  } = m.useModule(ModuleImplementationsModule);

  // Deploy AlgebraUpgradeablePlugin implementation
  // Note: pluginFactory address will be updated after factory deployment
  // Using placeholder address for now (will be set in beacon)
  const pluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    "0x0000000000000000000000000000000000000001", // Placeholder for pluginFactory
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

// ============= FACTORY IMPLEMENTATION =============
// Deploy the Transparent Upgradeable Proxy factory implementation

const FactoryImplementationModule = buildModule("FactoryImplementation", (m) => {
  // Deploy factory implementation (for Transparent Proxy)
  const factoryImpl = m.contract("AlgebraUpgradeablePluginFactory", [], {
    id: "FactoryImplementation"
  });

  return { factoryImpl };
});

// ============= MAIN DEPLOYMENT =============
// Deploy everything: implementations, proxy, and configure

export default buildModule("AlgebraUpgradeablePluginFactoryDeployment", (m) => {
  const { pluginImpl } = m.useModule(PluginImplementationModule);
  const { factoryImpl } = m.useModule(FactoryImplementationModule);

  // Get deployer address for ProxyAdmin
  const proxyAdminOwner = m.getParameter("proxyAdminOwner", m.getAccount(0));

  // Encode initialize call data for the factory proxy
  const initializeCalldata = m.encodeFunctionCall(factoryImpl, "initialize", [
    config.algebraFactory,
    pluginImpl,
    config.defaultFeeConfig
  ]);

  // Deploy TransparentUpgradeableProxy pointing to factory implementation
  const factoryProxy = m.contract("TransparentUpgradeableProxy", [
    factoryImpl,
    proxyAdminOwner,
    initializeCalldata
  ], {
    id: "FactoryProxy"
  });

  // Create a contract instance for the proxy with factory ABI
  // This allows us to call factory methods on the proxy
  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", factoryProxy, {
    id: "Factory"
  });

  // ============= POST-DEPLOYMENT CONFIGURATION =============

  // Set farming address if provided
  if (config.farmingCenter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setFarmingAddress", [config.farmingCenter], {
      id: "SetFarmingAddress"
    });
  }

  // Set security registry if provided
  if (config.securityRegistry !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setSecurityRegistry", [config.securityRegistry], {
      id: "SetSecurityRegistry"
    });
  }

  // Set rebalance manager if provided
  if (config.rebalanceManager !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setDefaultRebalanceManager", [config.rebalanceManager], {
      id: "SetRebalanceManager"
    });
  }

  // Set ALM TWAP periods if non-zero
  if (config.slowTwapPeriod > 0 && config.fastTwapPeriod > 0) {
    m.call(factory, "setDefaultAlmTwapPeriods", [config.slowTwapPeriod, config.fastTwapPeriod], {
      id: "SetAlmTwapPeriods"
    });
  }

  return {
    factory,
    factoryImpl,
    factoryProxy,
    ...m.useModule(PluginImplementationModule)
  };
});

// ============= UPGRADE MODULE =============
// Use this module to upgrade the factory via ProxyAdmin
// Note: You need to call ProxyAdmin.upgradeAndCall() directly

export const UpgradeFactoryModule = buildModule("UpgradeFactory", (m) => {
  // Get existing factory proxy address (update this after initial deployment)
  const existingFactoryProxy = m.getParameter("factoryProxyAddress", "0x0000000000000000000000000000000000000000");
  const proxyAdminAddress = m.getParameter("proxyAdminAddress", "0x0000000000000000000000000000000000000000");
  
  // Deploy new factory implementation
  const newFactoryImpl = m.contract("AlgebraUpgradeablePluginFactory", [], {
    id: "NewFactoryImplementation"
  });

  // Get ProxyAdmin instance
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
    id: "ProxyAdmin"
  });

  // Upgrade to new implementation via ProxyAdmin
  m.call(proxyAdmin, "upgradeAndCall", [existingFactoryProxy, newFactoryImpl, "0x"], {
    id: "UpgradeFactory"
  });

  return { newFactoryImpl, proxyAdmin };
});

// ============= PLUGIN UPGRADE MODULE =============
// Use this module to upgrade all plugins to a new implementation

export const UpgradePluginsModule = buildModule("UpgradePlugins", (m) => {
  // Get existing factory proxy address
  const existingFactoryProxy = m.getParameter("factoryProxyAddress", "0x0000000000000000000000000000000000000000");
  
  // Deploy new module implementations if needed
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
    existingFactoryProxy,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl
  ], {
    id: "NewPluginImplementation"
  });

  // Get factory instance at proxy address
  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", existingFactoryProxy, {
    id: "ExistingFactoryForPluginUpgrade"
  });

  // Upgrade all plugins via beacon
  m.call(factory, "upgradePlugins", [newPluginImpl], {
    id: "UpgradePlugins"
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
