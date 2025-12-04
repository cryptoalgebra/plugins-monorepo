import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x10253594A832f967994b44f33411940533302ACb"; 
const wnative = "0x577bdFf849E65C1eFfeb8114e9cd243C1180F158";
const poolDeployer = "0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A";
const farming = "0x658E287E9C820484f5808f687dC4863B552de37D";

export default buildModule("AlgebraDefaultAllInclusivePluginFactory", (m) => {
  // Deploy PluginDeployer library first
  const PluginDeployer = m.library("PluginDeployer");

  const pluginFactory = m.contract("AlgebraDefaultAllInclusivePluginFactory", [factory], {
    libraries: {
      PluginDeployer,
    },
  });

  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  const registry = m.contract("SecurityRegistry", [factory]);

  const discountRegistry = m.contract("FeeDiscountRegistry", [factory]);

  m.call(pluginFactory, "setSecurityRegistry", [registry]);

  m.call(pluginFactory, "setFeeDiscountRegistry", [discountRegistry]);

  m.call(pluginFactory, "setFarmingAddress", [farming]);

  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  return {pluginFactory, registry, limitOrderManager, discountRegistry};
});