// @ts-nocheck
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// ============= CONFIGURATION =============
// Update these addresses for your deployment network

const config = {
  // Algebra Core Factory address
  algebraFactory: "0x51a744E9FEdb15842c3080d0937C99A365C6c358",
  
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
  const { factoryImpl } = m.useModule(FactoryImplementationModule);

  // The proxy deploys its own ProxyAdmin, owned by the deployer, and initializes in its constructor,
  // so no one can initialize it first. The plugin implementation needs the proxy address, so the
  // beacon starts on the factory implementation and is moved to the plugin once that is deployed.
  const initData = m.encodeFunctionCall(factoryImpl, "initialize", [
    config.algebraFactory,
    factoryImpl,
    config.defaultFeeConfig
  ], {
    id: "FactoryInitData"
  });

  const factoryProxy = m.contract("TransparentUpgradeableProxy", [
    factoryImpl,
    m.getAccount(0),
    initData
  ], {
    id: "FactoryProxy"
  });

  const proxyAdminAddress = m.readEventArgument(factoryProxy, "AdminChanged", "newAdmin", {
    id: "ProxyAdminAddress"
  });
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
    id: "ProxyAdmin"
  });

  return { factoryProxy, proxyAdmin };
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
  
  // 2. Deploy factory implementation and its initialized proxy
  const { factoryImpl } = m.useModule(FactoryImplementationModule);
  const { factoryProxy, proxyAdmin } = m.useModule(FactoryProxyModule);

  // 3. Deploy plugin implementation (needs factoryProxy address)
  const { pluginImpl } = m.useModule(PluginImplementationModule);

  // 4. Point the beacon at the plugin implementation
  const factory = m.contractAt("AlgebraUpgradeablePluginFactory", factoryProxy, {
    id: "Factory"
  });

  const setPluginImplementation = m.call(factory, "upgradePlugins", [pluginImpl], {
    id: "SetPluginImplementation"
  });

  const algebraFactory = m.contractAt("IAlgebraFactory", config.algebraFactory, {
    id: "AlgebraFactory"
  });

  // ============= SECURITY REGISTRY =============
  // Always deploy SecurityRegistry for the target AlgebraFactory.
  const securityRegistry = m.contract("SecurityRegistry", [config.algebraFactory], { id: "SecurityRegistry" });

  // ============= POST-DEPLOYMENT CONFIGURATION =============

  // Set farming address if provided
  if (config.farmingCenter !== "0x0000000000000000000000000000000000000000") {
    m.call(factory, "setFarmingAddress", [config.farmingCenter], {
      id: "SetFarmingAddress",
      after: [setPluginImplementation]
    });
  }

  // Always set SecurityRegistry (either provided or freshly deployed)
  m.call(factory, "setSecurityRegistry", [securityRegistry], {
    id: "SetSecurityRegistry",
    after: [setPluginImplementation, securityRegistry]
  });

  // Set DefaultPluginFactory in AlgebraFactory
  m.call(algebraFactory, "setDefaultPluginFactory", [factoryProxy], {
    id: "SetDefaultPluginFactory",
    after: [setPluginImplementation]
  });

  return {
    factory,
    factoryImpl,
    factoryProxy,
    proxyAdmin,
    securityRegistry,
    ...m.useModule(PluginImplementationModule)
  };
});