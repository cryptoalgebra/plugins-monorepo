import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const factoryAddress = "0x10253594A832f967994b44f33411940533302ACb";
const farmingCenter = "0x658E287E9C820484f5808f687dC4863B552de37D";

export default buildModule("AlgebraDefaultPluginFactory", (m) => {
	const algebraDefaultPluginFactory = m.contract("AlgebraDefaultPluginFactory", [factoryAddress, "0x0000000000000000000000000000000000000000000000000000000000000000"]);
	
	m.call(algebraDefaultPluginFactory, "setFarmingAddress", [farmingCenter]);

	return { algebraDefaultPluginFactory };
});
