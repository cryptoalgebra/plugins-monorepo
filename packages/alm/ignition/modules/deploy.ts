import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const vault = "0x8eEb4BFeE4092566b0E759E0C813F4B19F8A02b3"; 
const minTimeBetweenRebalances = 600;

const thresholds = [
	100,
	9400,
	8100,
	7800,
	9100,
	100,
	2500,
	900,
	200,
	300,
	3000,
	1500,
	500
];

export default buildModule("RebalanceManager", (m) => {
  const rebalanceManager = m.contract("RebalanceManager", [vault, minTimeBetweenRebalances, thresholds]);

  return { rebalanceManager };
});