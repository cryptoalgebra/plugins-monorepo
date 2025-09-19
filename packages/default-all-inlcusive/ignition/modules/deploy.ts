import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x2fB84Ae4b1B6aeEc5627268070cF44C678Cd9728"; 
const entryPoint = "0x2b1343520431F6bEF22F94e9ad9E209cF18B6043";
const wnative = "0x4200000000000000000000000000000000000006";
const poolDeployer = "0x5471AAF4B2df55478a0B4043831d3276627D48D1";
const farming = "0xD1271285aaBe5CbE5E64248d1cb18B8c8550f4fD";

export default buildModule("AlgebraCustomAllInclusivePluginFactory", (m) => {
  const pluginFactory = m.contract("AlgebraCustomAllInclusivePluginFactory", [factory, entryPoint]);

  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  const registry = m.contract("SecurityRegistry", [factory]);

  m.call(pluginFactory, "setSecurityRegistry", [registry]);

  m.call(pluginFactory, "setFarmingAddress", [farming]);

  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  return {pluginFactory, registry, limitOrderManager};
});