import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x10253594A832f967994b44f33411940533302ACb"; 
const farmingCenterAddress = "0xB4F9b6b019E75CBe51af4425b2Fc12797e2Ee2a1"; 
const wNativeToken = "0xcc788DC0486CD2BaacFf287eea1902cc09FbA570";
const poolDeployer = "0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A";

const dynamicFeeConfig = [
  2500, 
  12000, 
  360,
  60000, 
  59, 
  8500, 
  500 
]

export default buildModule("DefaultMainPluginFactory", (m) => {
  const pluginFactory = m.contract("DefaultMainPluginFactory", [factory]);
  const oracle = m.contract("DynamicFeeOracle", [dynamicFeeConfig]);
  const limitOrderManager = m.contract("LimitOrderManager", [wNativeToken, poolDeployer, pluginFactory, factory]);
  const securityRegistry = m.contract("SecurityRegistry", [factory]);

  m.call(pluginFactory, "setFarmingAddress", [farmingCenterAddress]);

  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  m.call(pluginFactory, "setSecurityRegistry", [securityRegistry]);

  return { pluginFactory, oracle, limitOrderManager, securityRegistry };
});

