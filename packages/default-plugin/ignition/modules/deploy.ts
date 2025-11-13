import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x36077D39cdC65E1e3FB65810430E5b2c4D5fA29E";
const farmingCenter = "0xB781A7afCf46dEC1Fa16a722eFD25433D1B9F261";
const wnative = "0x4200000000000000000000000000000000000006";
const poolDeployer = "0x5471AAF4B2df55478a0B4043831d3276627D48D1"; 

export default buildModule("AlgebraDefaultPluginFactory", (m) => {
	const algebraDefaultPluginFactory = m.contract("AlgebraDefaultPluginFactory", [factoryAddress]);

	const limitOrderManager = m.contract("LimitOrderManager", [wnative, poolDeployer, algebraDefaultPluginFactory, factoryAddress]);

	const securityRegistry = m.contract("SecurityRegistry", [factoryAddress]);
	
	m.call(algebraDefaultPluginFactory, "setFarmingAddress", [farmingCenter]);
	m.call(algebraDefaultPluginFactory, "setSecurityRegistry", [securityRegistry]);
	m.call(algebraDefaultPluginFactory, "setLimitOrderManager", [limitOrderManager]);

	return { algebraDefaultPluginFactory, securityRegistry, limitOrderManager };
});