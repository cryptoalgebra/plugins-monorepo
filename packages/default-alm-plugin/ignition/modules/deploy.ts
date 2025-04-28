import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x51a744E9FEdb15842c3080d0937C99A365C6c358";

export default buildModule("AlgebraDefaultPluginFactory", (m) => {
	const defaultAlmPluginFactory = m.contract("AlgebraDefaultPluginFactory", [factory]);
	
	const factoryContract = m.contractAt("IAlgebraFactory", factory);

	m.call(factoryContract, "setDefaultPluginFactory", [defaultAlmPluginFactory]);

	return { defaultAlmPluginFactory };
});
