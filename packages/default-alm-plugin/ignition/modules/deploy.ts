import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const pool = "0xabff72aee1ba72fc459acd5222dd84a3182411bb";
const factory = "0x51a744E9FEdb15842c3080d0937C99A365C6c358";
const pluginFactory = "0x05f3bd357D47D159ac7d33f9DBaaCFc65d31976d";
const feeConfig = {
	alpha1:  2900,
	alpha2:  12000,
	beta1:  360,
	beta2:  60000,
	gamma1:  59,
	gamma2:  8500,
	baseFee:  100
};

export default buildModule("DefaultAlmPlugin", (m) => {
	const defaultAlmPlugin = m.contract("DefaultAlmPlugin", [pool, factory, pluginFactory, feeConfig]);
	
	return { defaultAlmPlugin };
});
