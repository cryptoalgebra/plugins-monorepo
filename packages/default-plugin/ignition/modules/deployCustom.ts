import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E";
const farmingCenter = "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261";
const entryPoint = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export default buildModule("AlgebraCustomPluginFactory", (m) => {
	const algebraCustomPluginFactory = m.contract("AlgebraCustomPluginFactory", [factoryAddress, entryPoint]);

	const securityRegistry = m.contract("SecurityRegistry", [factoryAddress]);
	
	m.call(algebraCustomPluginFactory, "setFarmingAddress", [farmingCenter]);
	m.call(algebraCustomPluginFactory, "setSecurityRegistry", [securityRegistry]);

	return { algebraCustomPluginFactory, securityRegistry };
});