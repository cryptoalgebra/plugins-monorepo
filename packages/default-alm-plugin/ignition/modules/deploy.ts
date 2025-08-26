import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E";
const farmingCenter = "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261";
const securityRegistry = "0x0A607e49D838d4226B129822bD696FaFE6ea0f0B";
const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export default buildModule("DefaultAlmPluginFactory", (m) => {
	// Deploy PluginDeployer library first
	const PluginDeployer = m.library("PluginDeployer");
	
	// Deploy DefaultAlmPluginFactory with linked PluginDeployer library
	const DefaultAlmPluginFactory = m.contract("DefaultAlmPluginFactory", [factoryAddress], {
		libraries: {
			PluginDeployer,
		},
	});
	
	m.call(DefaultAlmPluginFactory, "setFarmingAddress", [farmingCenter]);

	m.call(DefaultAlmPluginFactory, "setSecurityRegistry", [securityRegistry]);

	m.call(DefaultAlmPluginFactory, "setRouter", [routerAddress]);

	return { DefaultAlmPluginFactory, PluginDeployer };
});
