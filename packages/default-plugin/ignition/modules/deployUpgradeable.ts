// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0xd9A0ffa58143CdC5C1767208dDdB64a1889D78ae",
  
  // Farming center address (optional, can be set later)
  farmingCenter: "0xCf5d80378efC08b20aCAB1Ee5F296E5cB5a8E8C2",

  // Reflex router (optional, can be set later)
  reflexRouter: "0x0000000000000000000000000000000000000000",

  // Reflex config id (optional, bytes32(0) keeps router default)
  reflexConfigId: "0x0000000000000000000000000000000000000000000000000000000000000000",

  // LimitOrderManager constructor args
  wNativeToken: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
  poolDeployer: "0x6207Dc4f7f0632d8e90034be5E04dfa3A731b564",
  
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

  const reflexImpl = m.contract("ReflexPluginImplementation", [], {
    id: "ReflexImpl"
  });

  const feeDiscountImpl = m.contract("FeeDiscountPluginImplementation", [], {
    id: "FeeDiscountImpl"
  });

  const limitOrderImpl = m.contract("LimitOrderPluginImplementation", [], {
    id: "LimitOrderImpl"
  });

  return {
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    reflexImpl,
    feeDiscountImpl,
    limitOrderImpl
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
    securityImpl,
    reflexImpl,
    feeDiscountImpl,
    limitOrderImpl
  } = m.useModule(ModuleImplementationsModule);
  const { factoryProxy } = m.useModule(FactoryProxyModule);

  const pluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    factoryProxy,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    reflexImpl,
    feeDiscountImpl,
    limitOrderImpl
  ], {
    id: "PluginImplementation"
  });

  return { 
    pluginImpl,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    reflexImpl,
    feeDiscountImpl,
    limitOrderImpl
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

  const algebraFactory = m.contractAt("IAlgebraFactory", config.algebraFactory, {
    id: "AlgebraFactory"
  });

  // ============= SECURITY REGISTRY =============
  // Always deploy SecurityRegistry for the target AlgebraFactory.
  const securityRegistry = m.contract("SecurityRegistry", [config.algebraFactory], { id: "SecurityRegistry" });

  // ============= FEE DISCOUNT REGISTRY =============
  // Always deploy FeeDiscountRegistry for the target AlgebraFactory.
  const feeDiscountRegistry = m.contract("FeeDiscountRegistry", [config.algebraFactory], { id: "FeeDiscountRegistry" });

  // ============= LIMIT ORDER MANAGER =============
  const limitOrderManager = m.contract("LimitOrderManager", [
    config.wNativeToken,
    config.poolDeployer,
    factoryProxy,
    config.algebraFactory
  ], { id: "LimitOrderManager" });

  // ============= POST-DEPLOYMENT CONFIGURATION =============

  // Set farming address if provided
  if (config.farmingCenter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setFarmingAddress", [config.farmingCenter], {
      id: "SetFarmingAddress",
      after: [upgradeAndInitialize]
    });
  }

  // Always set SecurityRegistry (either provided or freshly deployed)
  m.call(factory, "setSecurityRegistry", [securityRegistry], {
    id: "SetSecurityRegistry",
    after: [upgradeAndInitialize, securityRegistry]
  });

  // Always set FeeDiscountRegistry (either provided or freshly deployed)
  m.call(factory, "setFeeDiscountRegistry", [feeDiscountRegistry], {
    id: "SetFeeDiscountRegistry",
    after: [upgradeAndInitialize, feeDiscountRegistry]
  });

  // Set LimitOrderManager
  m.call(factory, "setLimitOrderManager", [limitOrderManager], {
    id: "SetLimitOrderManager",
    after: [upgradeAndInitialize, limitOrderManager]
  });

  // Set DefaultPluginFactory in AlgebraFactory
  m.call(algebraFactory, "setDefaultPluginFactory", [factoryProxy], {
    id: "SetDefaultPluginFactory",
    after: [upgradeAndInitialize]
  });

  // Set Reflex defaults if provided
  if (config.reflexRouter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setRouter", [config.reflexRouter], {
      id: "SetReflexRouter",
      after: [upgradeAndInitialize]
    });
  }

  if (config.reflexConfigId !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    m.call(factory, "setConfigId", [config.reflexConfigId], {
      id: "SetReflexConfigId",
      after: [upgradeAndInitialize]
    });
  }

  return {
    factory,
    factoryImpl,
    factoryProxy,
    securityRegistry,
    feeDiscountRegistry,
    limitOrderManager,
    ...m.useModule(PluginImplementationModule)
  };
});
