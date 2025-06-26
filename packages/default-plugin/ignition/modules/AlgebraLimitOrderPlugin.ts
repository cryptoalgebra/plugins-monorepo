import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const wnative = "0x4200000000000000000000000000000000000006"
const poolDeployer = "0x19652b0d7ccddD35E9CC4aCF418556C3Dd0fd31f"
const factory = "0xAC900f12fB25d514e3ccFE8572B153A9991cA4e7"

const AlgebraLimitOrderPluginModule = buildModule("AlgebraLimitOrderPlugin", (m) => {
  // Deploy AlgebraLimitOrderPluginFactory
  const pluginFactory = m.contract("AlgebraLimitOrderPluginFactory", [factory]);

  // Deploy LimitOrderManager
  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  // Deploy SecurityRegistry
  const securityRegistry = m.contract("SecurityRegistry", [factory]);

  // Set LimitOrderManager in factory
  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  // Set SecurityRegistry in factory
  m.call(pluginFactory, "setSecurityRegistry", [securityRegistry]);

  // Set SecurityRegistry in factory
  m.call(pluginFactory, "setFarming", [securityRegistry]);

  return {
    pluginFactory,
    limitOrderManager,
    securityRegistry,
  };
});

export default AlgebraLimitOrderPluginModule;
