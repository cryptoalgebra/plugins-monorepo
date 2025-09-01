import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const wnative = "0x4200000000000000000000000000000000000006"
const poolDeployer = "0x19652b0d7ccddD35E9CC4aCF418556C3Dd0fd31f"
const factory = "0xcD58521ecaC7724d1752F941C56490c27bAe9ab0"
const farmingCenter = "0xAC900f12fB25d514e3ccFE8572B153A9991cA4e7"

const AlgebraLimitOrderPluginModule = buildModule("AlgebraLimitOrderPlugin", (m) => {
  // Deploy AlgebraLimitOrderPluginFactory
  const pluginFactory = m.contract("AlgebraLimitOrderPluginFactory", [factory]);

  // Deploy LimitOrderManager
  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  // Set LimitOrderManager in factory
  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);


  // Set FarmingCenter in factory
  m.call(pluginFactory, "setFarmingAddress", [farmingCenter]);

  return {
    pluginFactory,
    limitOrderManager
  };
});

export default AlgebraLimitOrderPluginModule;
