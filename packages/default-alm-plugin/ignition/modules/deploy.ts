import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factory = "0x51a744E9FEdb15842c3080d0937C99A365C6c358";

export default buildModule("RebalanceManagerOracle", (m) => {
	const defaultAlmPlugin = m.contract("DefaultAlmPlugin", [factory]);
	
	const factoryContract = m.contractAt("IAlgebraFactory", factory);

	console.log('defaultAlmPlugin.id: ', defaultAlmPlugin.id);

	m.call(factoryContract.setDefaultPluginFactory, defaultAlmPlugin.id);

	return { defaultAlmPlugin };
});
