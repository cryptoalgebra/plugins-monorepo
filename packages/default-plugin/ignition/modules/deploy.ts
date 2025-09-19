import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E";
const farmingCenter = "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261";

export default buildModule("AlgebraDefaultPluginFactory", (m) => {
	const algebraDefaultPluginFactory = m.contract("AlgebraDefaultPluginFactory", [factoryAddress]);
	
	m.call(algebraDefaultPluginFactory, "setFarmingAddress", [farmingCenter]);

	return { algebraDefaultPluginFactory };
});