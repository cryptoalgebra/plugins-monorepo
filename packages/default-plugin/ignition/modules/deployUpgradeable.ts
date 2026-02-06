// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x51a744E9FEdb15842c3080d0937C99A365C6c358",

  // Pool deployer address (from Algebra Core)
  poolDeployer: "0x0000000000000000000000000000000000000000",

  // Wrapped native token (WETH/WMATIC/etc)
  wNativeToken: "0x0000000000000000000000000000000000000000",
  
  // Farming center address (optional, can be set later)
  farmingCenter: "0x3aA96eDb755C44F3E50C5408a36abb52f28326Ba",
  
  // Default fee configuration for dynamic fee module
  defaultFeeConfig: {
    alpha1: 2900,
    alpha2: 12000,
    beta1: 360,
    beta2: 60000,
    gamma1: 59,
    gamma2: 8500,
    baseFee: 100
  },

  // ============= OPTIONAL DEFAULTS (can be set later) =============
  // MevX defaults
  mevxRouter: "0x0000000000000000000000000000000000000000",
  mevxExecutor: "0x0000000000000000000000000000000000000000",
  profitDistributor: "0x0000000000000000000000000000000000000000",
  mevxConfigId: "0x0000000000000000000000000000000000000000000000000000000000000000",

};

// ============= MODULE IMPLEMENTATIONS =============
// Deploy all module implementation contracts

const VolatilityOracleImplModule = buildModule("VolatilityOracleImpl", (m) => {
  const volatilityOracleImpl = m.contract("VolatilityOraclePluginImplementation", [], {
    id: "VolatilityOracleImpl"
  });
  return { volatilityOracleImpl };
});

const DynamicFeeImplModule = buildModule("DynamicFeeImpl", (m) => {
  const dynamicFeeImpl = m.contract("DynamicFeePluginImplementation", [], {
    id: "DynamicFeeImpl"
  });
  return { dynamicFeeImpl };
});

const FarmingProxyImplModule = buildModule("FarmingProxyImpl", (m) => {
  const farmingProxyImpl = m.contract("FarmingProxyPluginImplementation", [], {
    id: "FarmingProxyImpl"
  });
  return { farmingProxyImpl };
});

const AlmImplModule = buildModule("AlmImpl", (m) => {
  const almImpl = m.contract("AlmPluginImplementation", [], {
    id: "AlmImpl"
  });
  return { almImpl };
});

const SecurityImplModule = buildModule("SecurityImpl", (m) => {
  const securityImpl = m.contract("SecurityPluginImplementation", [], {
    id: "SecurityImpl"
  });
  return { securityImpl };
});

const MevxImplModule = buildModule("MevxImpl", (m) => {
  const mevxImpl = m.contract("MevxPluginImplementation", [], {
    id: "MevxImpl"
  });
  return { mevxImpl };
});

const FeeDiscountImplModule = buildModule("FeeDiscountImpl", (m) => {
  const feeDiscountImpl = m.contract("FeeDiscountPluginImplementation", [], {
    id: "FeeDiscountImpl"
  });
  return { feeDiscountImpl };
});

const LimitOrderImplModule = buildModule("LimitOrderImpl", (m) => {
  const limitOrderImpl = m.contract("LimitOrderPluginImplementation", [], {
    id: "LimitOrderImpl"
  });
  return { limitOrderImpl };
});

const SlidingFeeImplModule = buildModule("SlidingFeeImpl", (m) => {
  const slidingFeeImpl = m.contract("SlidingFeePluginImplementation", [], {
    id: "SlidingFeeImpl"
  });
  return { slidingFeeImpl };
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
  const { volatilityOracleImpl } = m.useModule(VolatilityOracleImplModule);
  const { dynamicFeeImpl } = m.useModule(DynamicFeeImplModule);
  const { farmingProxyImpl } = m.useModule(FarmingProxyImplModule);
  const { almImpl } = m.useModule(AlmImplModule);
  const { securityImpl } = m.useModule(SecurityImplModule);
  const { mevxImpl } = m.useModule(MevxImplModule);
  const { feeDiscountImpl } = m.useModule(FeeDiscountImplModule);
  const { limitOrderImpl } = m.useModule(LimitOrderImplModule);
  const { slidingFeeImpl } = m.useModule(SlidingFeeImplModule);
  const { factoryProxy } = m.useModule(FactoryProxyModule);

  const pluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    factoryProxy,
    [
      volatilityOracleImpl,
      dynamicFeeImpl,
      farmingProxyImpl,
      almImpl,
      securityImpl,
      mevxImpl,
      feeDiscountImpl,
      limitOrderImpl,
      slidingFeeImpl
    ]
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
    mevxImpl,
    feeDiscountImpl,
    limitOrderImpl,
    slidingFeeImpl
  };
});

// ============= MAIN DEPLOYMENT =============

export default buildModule("AlgebraUpgradeablePluginFactoryDeployment", (m) => {
  // 1. Deploy all module implementations (each in its own module for resilience)
  const { volatilityOracleImpl } = m.useModule(VolatilityOracleImplModule);
  const { dynamicFeeImpl } = m.useModule(DynamicFeeImplModule);
  const { farmingProxyImpl } = m.useModule(FarmingProxyImplModule);
  const { almImpl } = m.useModule(AlmImplModule);
  const { securityImpl } = m.useModule(SecurityImplModule);
  const { mevxImpl } = m.useModule(MevxImplModule);
  const { feeDiscountImpl } = m.useModule(FeeDiscountImplModule);
  const { limitOrderImpl } = m.useModule(LimitOrderImplModule);
  const { slidingFeeImpl } = m.useModule(SlidingFeeImplModule);
  
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

  // ============= AUXILIARY CONTRACTS =============
  // Deploy SecurityRegistry, FeeDiscountRegistry, and LimitOrderManager
  const securityRegistry = m.contract("SecurityRegistry", [config.algebraFactory], { id: "SecurityRegistry" });

  const feeDiscountRegistry = m.contract("FeeDiscountRegistry", [config.algebraFactory], { id: "FeeDiscountRegistry" });

  // LimitOrderManager requires: wNativeToken, poolDeployer, basePluginFactory (factoryProxy), factory
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

  // Optional: set MevX defaults
  if (config.mevxRouter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setMevxRouter", [config.mevxRouter], {
      id: "SetMevxRouter",
      after: [upgradeAndInitialize]
    });
  }
  if (config.mevxExecutor !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setMevxExecutor", [config.mevxExecutor], {
      id: "SetMevxExecutor",
      after: [upgradeAndInitialize]
    });
  }
  if (config.profitDistributor !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setProfitDistributor", [config.profitDistributor], {
      id: "SetProfitDistributor",
      after: [upgradeAndInitialize]
    });
  }
  if (config.mevxConfigId !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    m.call(factory, "setConfigId", [config.mevxConfigId], {
      id: "SetMevxConfigId",
      after: [upgradeAndInitialize]
    });
  }

  // Set FeeDiscountRegistry (freshly deployed)
  m.call(factory, "setFeeDiscountRegistry", [feeDiscountRegistry], {
    id: "SetFeeDiscountRegistry",
    after: [upgradeAndInitialize, feeDiscountRegistry]
  });

  // Set LimitOrderManager (freshly deployed)
  m.call(factory, "setLimitOrderManager", [limitOrderManager], {
    id: "SetLimitOrderManager",
    after: [upgradeAndInitialize, limitOrderManager]
  });

  // Set DefaultPluginFactory in AlgebraFactory
  m.call(algebraFactory, "setDefaultPluginFactory", [factoryProxy], {
    id: "SetDefaultPluginFactory",
    after: [upgradeAndInitialize]
  });

  return {
    factory,
    factoryImpl,
    factoryProxy,
    securityRegistry,
    feeDiscountRegistry,
    limitOrderManager,
    pluginImpl,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    mevxImpl,
    feeDiscountImpl,
    limitOrderImpl,
    slidingFeeImpl
  };
});