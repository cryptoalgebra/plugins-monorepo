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
// Each module implementation is deployed separately for better resilience.
// If deployment fails, Ignition can resume from the last successful module.

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

// ============= PLUGIN UPGRADE MODULE =============
// Use this module to upgrade all plugins to a new implementation
//
// Usage:
//   1. Update factoryProxyAddress in config above
//   2. Run: npx hardhat ignition deploy ignition/modules/upgradePlugins.ts --network baseSepolia

export default buildModule("UpgradePlugins", (m) => {
  
  // Deploy new module implementations (each in its own module for resilience)
  const { volatilityOracleImpl } = m.useModule(VolatilityOracleImplModule);
  const { dynamicFeeImpl } = m.useModule(DynamicFeeImplModule);
  const { farmingProxyImpl } = m.useModule(FarmingProxyImplModule);
  const { almImpl } = m.useModule(AlmImplModule);
  const { securityImpl } = m.useModule(SecurityImplModule);
  const { mevxImpl } = m.useModule(MevxImplModule);
  const { feeDiscountImpl } = m.useModule(FeeDiscountImplModule);
  const { limitOrderImpl } = m.useModule(LimitOrderImplModule);
  const { slidingFeeImpl } = m.useModule(SlidingFeeImplModule);

  // Deploy new plugin implementation
  const newPluginImpl = m.contract("AlgebraUpgradeablePlugin", [
    config.algebraFactory,
    config.factoryProxyAddress,
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
    securityImpl,
    mevxImpl,
    feeDiscountImpl,
    limitOrderImpl,
    slidingFeeImpl
  };
});
