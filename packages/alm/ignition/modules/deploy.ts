import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const vault = "0x1487d907247e6e1bcfb6c73b193c74a16266368c"; 
const minTimeBetweenRebalances = 600;

// struct Thresholds {
//     uint16 depositTokenUnusedThreshold;
//     uint16 simulate;
//     uint16 normalThreshold;
//     uint16 underInventoryThreshold;
//     uint16 overInventoryThreshold;
//     uint16 priceChangeThreshold;
//     uint16 extremeVolatility;
//     uint16 highVolatility;
//     uint16 someVolatility;
//     uint16 dtrDelta;
//     uint16 baseLowPct;
//     uint16 baseHighPct;
//     uint16 limitReservePct;
//   }

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
  const rebalanceManagerOracle = m.contract("RebalanceManager", [vault, minTimeBetweenRebalances, thresholds]);

  return { rebalanceManagerOracle };
});
