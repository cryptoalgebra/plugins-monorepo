import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { AlmPluginTest, MockVault } from '../typechain';;
import { ZERO_ADDRESS } from 'test-utils/consts';
import { rebalances } from "./almRebalances.json";
import { rebalances3 } from "./almRebalances3.json";

describe('#AlmPlugin', () => {
	async function almPluginFixture(
		thresholds: {
			depositTokenUnusedThreshold: string | number,
			simulate: string | number,
			normalThreshold: string | number,
			underInventoryThreshold: string | number,
			overInventoryThreshold: string | number,
			priceChangeThreshold: string | number,
			extremeVolatility: string | number,
			highVolatility: string | number,
			someVolatility: string | number,
			dtrDelta: string | number,
			baseLowPct: string | number,
			baseHighPct: string | number,
			limitReservePct: string | number,
		},
		tickSpacing: number,
		allowToken0: boolean,
		allowToken1: boolean
	) {
		const mockVaultFactory = await ethers.getContractFactory('MockVault');
		const mockVault = await mockVaultFactory.deploy(ZERO_ADDRESS, true, false) as any as MockVault;

		await mockVault.setAllowTokens(allowToken0, allowToken1);

		const almPluginFactory = await ethers.getContractFactory('AlmPluginTest');
		const almPlugin = (await almPluginFactory.deploy(
			await mockVault.getAddress(), 7200, thresholds, tickSpacing
		)) as any as AlmPluginTest;

		return {
			mockVault: mockVault,
			almPlugin: almPlugin
		}
	}

	describe('#initializeALM', () => {
		it("can initialize", async () => {
			await almPluginFixture({
				depositTokenUnusedThreshold: 100,
				simulate: 9400, // было 9300
				normalThreshold: 8100, // было 8000
				underInventoryThreshold: 7800, // было 7700
				overInventoryThreshold: 9100,
				priceChangeThreshold: 100,
				extremeVolatility: 2500,
				highVolatility: 900, // было 500
				someVolatility: 200, // было 100
				dtrDelta: 300,
				baseLowPct: 3000, // было 2000
				baseHighPct: 1500, // было 3000
				limitReservePct: 500,
			}, 228, true, false);
		});
	});

	describe('#rebalance1', () => {
		for (const rebalance of rebalances) {
			it(`rebalance for tx ${rebalance.transactionHash}`, async () => {
				const { almPlugin, mockVault } = await almPluginFixture({
					depositTokenUnusedThreshold: rebalance.state.depositTokenUnusedThreshold,
					simulate: rebalance.state.simulateTrigger,
					normalThreshold: rebalance.state.normalTrigger,
					underInventoryThreshold: rebalance.state.underTrigger,
					overInventoryThreshold: rebalance.state.overTrigger,
					priceChangeThreshold: (BigInt(rebalance.state.priceChangeTrigger) / 2n).toString(),
					extremeVolatility: rebalance.state.extremeVolatility,
					highVolatility: rebalance.state.highVolatility,
					someVolatility: rebalance.state.someVolatility,
					dtrDelta: rebalance.state.dtrDelta,
					baseLowPct: rebalance.state.baseLowPct,
					baseHighPct: rebalance.state.baseHighPct,
					limitReservePct: rebalance.state.limitReservePct,
				}, 60, true, false);

				const state = rebalance.state;
				const currentTick = BigInt(state.currentTick);
				const lastBlockTimestamp = 0n;
				const slowTick = 0n;
				const fastTick = 0n;

				await almPlugin.setDecimals(18, 18);

				await mockVault.setTotalAmounts(
					BigInt(state.usedToken0),
					BigInt(state.usedToken1)
				);

				await almPlugin.setPrices(
					BigInt(state.twapSlow),
					BigInt(state.twapFast),
					BigInt(state.currentPrice)
				);

				await almPlugin.setDepositTokenBalance(state.depositTokenBalance);

				await almPlugin.setLastRebalanceCurrentPrice(BigInt(state.lastRebalancePrice));
				await almPlugin.setState(BigInt(state.state));

				await expect(almPlugin.rebalance(currentTick, slowTick, fastTick, lastBlockTimestamp)).to.emit(mockVault, 'MockRebalance')
					.withArgs(rebalance.rebalance.basePosition.bottomTick, rebalance.rebalance.basePosition.topTick, rebalance.rebalance.limitPosition.bottomTick, rebalance.rebalance.limitPosition.topTick);
			});
		}
	});

	describe('#rebalance3', () => {
		for (const rebalance of rebalances3.slice(0,30)) {
			it(`rebalance for tx ${rebalance.transactionHash}`, async () => {
				const { almPlugin, mockVault } = await almPluginFixture({
					depositTokenUnusedThreshold: rebalance.state.depositTokenUnusedThreshold,
					simulate: rebalance.state.simulateTrigger,
					normalThreshold: rebalance.state.normalTrigger,
					underInventoryThreshold: rebalance.state.underTrigger,
					overInventoryThreshold: rebalance.state.overTrigger,
					priceChangeThreshold: (BigInt(rebalance.state.priceChangeTrigger) / 2n).toString(),
					extremeVolatility: rebalance.state.extremeVolatility,
					highVolatility: rebalance.state.highVolatility,
					someVolatility: rebalance.state.someVolatility,
					dtrDelta: rebalance.state.dtrDelta,
					baseLowPct: rebalance.state.baseLowPct,
					baseHighPct: rebalance.state.baseHighPct,
					limitReservePct: rebalance.state.limitReservePct,
				}, 200, false, true);

				const state = rebalance.state;
				const currentTick = BigInt(state.currentTick);
				const lastBlockTimestamp = 0n;
				const slowTick = 0n;
				const fastTick = 0n;

				await almPlugin.setDecimals(6, 18);

				await mockVault.setTotalAmounts(
					BigInt(state.usedToken0),
					BigInt(state.usedToken1)
				);

				await almPlugin.setPrices(
					BigInt(state.twapSlow),
					BigInt(state.twapFast),
					BigInt(state.currentPrice)
				);

				await almPlugin.setDepositTokenBalance(state.depositTokenBalance);

				await almPlugin.setLastRebalanceCurrentPrice(BigInt(state.lastRebalancePrice));
				await almPlugin.setState(BigInt(state.state));

				await expect(almPlugin.rebalance(currentTick, slowTick, fastTick, lastBlockTimestamp)).to.emit(mockVault, 'MockRebalance')
					.withArgs(rebalance.rebalance.basePosition.bottomTick, rebalance.rebalance.basePosition.topTick, rebalance.rebalance.limitPosition.bottomTick, rebalance.rebalance.limitPosition.topTick);
			});
		}
	});
});