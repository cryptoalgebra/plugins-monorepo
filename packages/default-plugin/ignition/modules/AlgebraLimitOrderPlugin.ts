import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const wnative = "0xa5733b3a8e62a8faf43b0376d5faf46e89b3033e"
const poolDeployer = "0x955B95b8532fe75DDCf2161f61127Be74A768158"
const factory = "0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04"

const AlgebraLimitOrderPluginModule = buildModule("AlgebraLimitOrderPlugin", (m) => {
  // Deploy AlgebraLimitOrderPluginFactory
  const pluginFactory = m.contract("AlgebraLimitOrderPluginFactory", [factory]);

  // Deploy LimitOrderManager
  const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, pluginFactory, factory]);

  // Deploy SecurityRegistry
  const securityRegistry = m.contract("SecurityRegistry", [factory]);

  // Deploy FeeDiscountRegistry
  const feeDiscountRegistry = m.contract("FeeDiscountRegistry", [factory]);

  return {
    pluginFactory,
    limitOrderManager,
    securityRegistry,
    feeDiscountRegistry
  };
});

export default AlgebraLimitOrderPluginModule;
