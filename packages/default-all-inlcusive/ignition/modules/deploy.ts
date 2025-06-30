import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0xcD58521ecaC7724d1752F941C56490c27bAe9ab0"; 
const entryPoint = "0xf026705d8F6f1d190867CdE5e48613190325cB9c";
const wnative = "0x4200000000000000000000000000000000000006";
const poolDeployer = "0x58fcDe2268c9cD0168bddC81ba4Cf9F174160258";

export default buildModule("AlgebraCustomAllInclusivePluginFactory", (m) => {
  const pluginFactory = m.contract("AlgebraCustomAllInclusivePluginFactory", [factory, entryPoint]);

  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  const registry = m.contract("SecurityRegistry", [factory]);

  m.call(pluginFactory, "setSecurityRegistry", [registry]);

  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  return {pluginFactory, registry, limitOrderManager};
});