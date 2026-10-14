// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const config = {
  // Algebra Core Factory address
  algebraFactory: ZERO_ADDRESS,

  // AlgebraCustomPoolEntryPoint address
  // It must hold CUSTOM_POOL_DEPLOYER and POOLS_ADMINISTRATOR roles in the AlgebraFactory
  entryPoint: ZERO_ADDRESS,

  // Farming center address (optional, can be set later)
  farmingCenter: ZERO_ADDRESS,

  // Existing SecurityRegistry (set to zero address to deploy a new one)
  securityRegistry: ZERO_ADDRESS,

  // Default MevX settings for new plugins (zero values are skipped, can be set later)
  mevxRouter: ZERO_ADDRESS,
  mevxExecutor: ZERO_ADDRESS,
  profitDistributor: ZERO_ADDRESS,
  mevxConfigId: ZERO_HASH,

  // New owner address for ProxyAdmin (set to zero address to skip transfer)
  newOwner: ZERO_ADDRESS,

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

const ModuleImplementationsModule = buildModule("CustomModuleImplementations", (m) => {
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

  const mevxImpl = m.contract("MevxPluginImplementation", [], {
    id: "MevxImpl"
  });

  return {
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    mevxImpl
  };
});

// ============= PROXY ADMIN =============

const ProxyAdminModule = buildModule("CustomProxyAdmin", (m) => {
  const proxyAdmin = m.contract("ProxyAdmin", [], {
    id: "ProxyAdmin"
  });

  return { proxyAdmin };
});

// ============= FACTORY IMPLEMENTATION =============

const FactoryImplementationModule = buildModule("CustomFactoryImplementation", (m) => {
  // Deploy factory implementation (for Transparent Proxy)
  const factoryImpl = m.contract("AlgebraCustomPluginFactory", [], {
    id: "FactoryImplementation"
  });

  return { factoryImpl };
});

// ============= FACTORY PROXY =============

const FactoryProxyModule = buildModule("CustomFactoryProxy", (m) => {
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

const PluginImplementationModule = buildModule("CustomPluginImplementation", (m) => {
  const {
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    mevxImpl
  } = m.useModule(ModuleImplementationsModule);
  const { factoryProxy } = m.useModule(FactoryProxyModule);

  // pluginFactory is bound to the custom factory proxy address
  const pluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    factoryProxy,
    volatilityOracleImpl,
    dynamicFeeImpl,
    farmingProxyImpl,
    almImpl,
    securityImpl,
    mevxImpl
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
    mevxImpl
  };
});

// ============= MAIN DEPLOYMENT =============

export default buildModule("AlgebraCustomPluginFactoryDeployment", (m) => {
  // 1. Deploy all module implementations first
  m.useModule(ModuleImplementationsModule);

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
    config.entryPoint,
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

  const factory = m.contractAt("AlgebraCustomPluginFactory", factoryProxy, {
    id: "Factory",
    after: [upgradeAndInitialize]
  });

  // ============= SECURITY REGISTRY =============
  // Reuse the provided SecurityRegistry or deploy a new one for the target AlgebraFactory.
  const securityRegistry = config.securityRegistry !== ZERO_ADDRESS
    ? config.securityRegistry
    : m.contract("SecurityRegistry", [config.algebraFactory], { id: "SecurityRegistry" });

  // ============= TRANSFER PROXY ADMIN OWNERSHIP =============
  // Transfer ProxyAdmin ownership to the new owner (e.g. multisig)
  // ProxyAdmin controls factory proxy upgrades
  if (config.newOwner !== ZERO_ADDRESS) {
    m.call(proxyAdmin, "transferOwnership", [config.newOwner], {
      id: "TransferProxyAdminOwnership",
      after: [upgradeAndInitialize]
    });
  }

  // ============= POST-DEPLOYMENT CONFIGURATION =============
  // Settings are applied to plugins created after they are set

  if (config.farmingCenter !== ZERO_ADDRESS) {
    m.call(factory, "setFarmingAddress", [config.farmingCenter], {
      id: "SetFarmingAddress"
    });
  }

  m.call(factory, "setSecurityRegistry", [securityRegistry], {
    id: "SetSecurityRegistry"
  });

  if (config.mevxRouter !== ZERO_ADDRESS) {
    m.call(factory, "setMevxRouter", [config.mevxRouter], { id: "SetMevxRouter" });
  }

  if (config.mevxExecutor !== ZERO_ADDRESS) {
    m.call(factory, "setMevxExecutor", [config.mevxExecutor], { id: "SetMevxExecutor" });
  }

  if (config.profitDistributor !== ZERO_ADDRESS) {
    m.call(factory, "setProfitDistributor", [config.profitDistributor], { id: "SetProfitDistributor" });
  }

  if (config.mevxConfigId !== ZERO_HASH) {
    m.call(factory, "setConfigId", [config.mevxConfigId], { id: "SetMevxConfigId" });
  }

  // Note: this is a custom-pool deployer, not the default plugin factory, so there is no setDefaultPluginFactory step.
  // Pools are created via factory.createCustomPoolAndInitialize(...), which routes through the entry point.
  // The factory admin needs the ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR role (or AlgebraFactory ownership),
  // and the plugin admin needs ALGEBRA_BASE_PLUGIN_MANAGER.

  return {
    factory,
    factoryImpl,
    factoryProxy,
    ...m.useModule(PluginImplementationModule)
  };
});
