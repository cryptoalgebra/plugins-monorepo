import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x5eDf7192d8fE580ff00727B30DfC1AAF0d57B2f6"; 
const entryPoint = "0x348F5E05B7c778F3467F07CEa0088841481C622d";

export default buildModule("AlgebraCustomPluginFactory", (m) => {
  const pluginFactory = m.contract("AlgebraCustomPluginFactory", [factory, entryPoint]);

  return { pluginFactory};
});
