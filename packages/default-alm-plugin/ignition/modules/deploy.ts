import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x904Af47469B13b341B41c552c952370b76B69DFA";

export default buildModule("DefaultAlmPluginFactory", (m) => {
	const DefaultAlmPluginFactory = m.contract("DefaultAlmPluginFactory", [factoryAddress]);

	const factory = m.contractAt("IAlgebraFactory", factoryAddress)
	
	m.call(factory, "setDefaultPluginFactory", [DefaultAlmPluginFactory]);
	
	return { DefaultAlmPluginFactory };
});
