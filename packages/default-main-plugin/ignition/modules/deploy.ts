import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x51a744E9FEdb15842c3080d0937C99A365C6c358"; 
const entryPoint = "0xe1909bcA4E528f7361b63F82330269d3001011e1";

const dynamicFeeConfig = [
  2500, 
  12000, 
  360,
  60000, 
  59, 
  8500, 
  500 
]

export default buildModule("DefaultMainCustomPluginFactory", (m) => {
  const pluginFactory = m.contract("DefaultMainCustomPluginFactory", [factory, entryPoint]);
  const oracle = m.contract("DynamicFeeOracle", [dynamicFeeConfig]);

  return { pluginFactory, oracle };
});

