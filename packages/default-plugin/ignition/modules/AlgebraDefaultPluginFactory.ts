import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AlgebraDefaultPluginFactoryModule = buildModule("AlgebraDefaultPluginFactory", (m) => {
  const algebraFactory = "0x10253594A832f967994b44f33411940533302ACb";

  const algebraDefaultPluginFactory = m.contract("AlgebraDefaultPluginFactory", [
    algebraFactory,
  ]);

  return { 
    algebraDefaultPluginFactory 
  };
});

export default AlgebraDefaultPluginFactoryModule;
