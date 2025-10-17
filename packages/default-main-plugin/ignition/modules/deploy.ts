import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x49a390a3dFd2d01389f799965F3af5961f87d228"; 
const farmingCenterAddress = "0x161C886a5ef51c4B20f2F4ca2caDB20c93245705"; 
const wNativeToken = "0x3bC8f037691Ce1d28c0bB224BD33563b49F99dE8"; // WETH address
const poolDeployer = "0x37A4950b4ea0C46596404895c5027B088B0e70e7"; // Set actual pool deployer address

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

  m.call(pluginFactory, "setFarmingAddress", [farmingCenterAddress]);

  m.call(pluginFactory, "setLimitOrderManager", [limitOrderManager]);

  return { pluginFactory, oracle, limitOrderManager };
});

