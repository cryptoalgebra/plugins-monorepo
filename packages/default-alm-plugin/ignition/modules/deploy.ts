import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E";
const farmingCenter = "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261";
const securityRegistry = "0x0A607e49D838d4226B129822bD696FaFE6ea0f0B";

export default buildModule("DefaultAlmPluginFactory", (m) => {
	const DefaultAlmPluginFactory = m.contract("DefaultAlmPluginFactory", [factoryAddress]);
	
	m.call(DefaultAlmPluginFactory, "setFarmingAddress", [farmingCenter]);

	m.call(DefaultAlmPluginFactory, "setSecurityRegistry", [securityRegistry]);

	return { DefaultAlmPluginFactory };
});
