import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { AlmPluginTest, MockVault } from '../typechain';
import { ZERO_ADDRESS } from 'test-utils/consts';
import { rebalances } from "./almRebalances.json";
import { rebalances3 } from "./almRebalances3.json";

describe('#AlmPlugin', () => {
	async function almPluginFixture(
		thresholds: {
			idleDepositRatio: string | number,
			maxDepositRatio: string | number,
			balancedStateMin: string | number,
			lowInventoryLevel: string | number,
			highInventoryLevel: string | number,
			priceShiftTrigger: string | number,
			criticalDeviation: string | number,
			majorDeviation: string | number,
			minorDeviation: string | number,
			ratioBuffer: string | number,
			baseRangeLower: string | number,
			baseRangeUpper: string | number,
			limitAllocation: string | number,
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
				idleDepositRatio: 100,
				maxDepositRatio: 9400, // было 9300
				balancedStateMin: 8100, // было 8000
				lowInventoryLevel: 7800, // было 7700
				highInventoryLevel: 9100,
				priceShiftTrigger: 100,
				criticalDeviation: 2500,
				majorDeviation: 900, // было 500
				minorDeviation: 200, // было 100
				ratioBuffer: 300,
				baseRangeLower: 3000, // было 2000
				baseRangeUpper: 1500, // было 3000
				limitAllocation: 500,
			}, 228, true, false);
		});
	});

	describe('#rebalance1', () => {
		for (const rebalance of rebalances) {
			if (rebalance.rebalance.limitPosition != null) {
				it(`rebalance for tx ${rebalance.transactionHash}`, async () => {
					const { almPlugin, mockVault } = await almPluginFixture({
						idleDepositRatio: rebalance.state.depositTokenUnusedThreshold,
						maxDepositRatio: rebalance.state.simulateTrigger,
						balancedStateMin: rebalance.state.normalTrigger,
						lowInventoryLevel: rebalance.state.underTrigger,
						highInventoryLevel: rebalance.state.overTrigger,
						priceShiftTrigger: (BigInt(rebalance.state.priceChangeTrigger) / 2n).toString(),
						criticalDeviation: rebalance.state.extremeVolatility,
						majorDeviation: rebalance.state.highVolatility,
						minorDeviation: rebalance.state.someVolatility,
						ratioBuffer: rebalance.state.dtrDelta,
						baseRangeLower: rebalance.state.baseLowPct,
						baseRangeUpper: rebalance.state.baseHighPct,
						limitAllocation: rebalance.state.limitReservePct,
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
		}
	});

	describe('#rebalance3', () => {
		for (const rebalance of rebalances3.slice(0,30)) {
			if (rebalance.rebalance.limitPosition != null) {
				it(`rebalance for tx ${rebalance.transactionHash}`, async () => {
					const { almPlugin, mockVault } = await almPluginFixture({
						idleDepositRatio: rebalance.state.depositTokenUnusedThreshold,
						maxDepositRatio: rebalance.state.simulateTrigger,
						balancedStateMin: rebalance.state.normalTrigger,
						lowInventoryLevel: rebalance.state.underTrigger,
						highInventoryLevel: rebalance.state.overTrigger,
						priceShiftTrigger: (BigInt(rebalance.state.priceChangeTrigger) / 2n).toString(),
						criticalDeviation: rebalance.state.extremeVolatility,
						majorDeviation: rebalance.state.highVolatility,
						minorDeviation: rebalance.state.someVolatility,
						ratioBuffer: rebalance.state.dtrDelta,
						baseRangeLower: rebalance.state.baseLowPct,
						baseRangeUpper: rebalance.state.baseHighPct,
						limitAllocation: rebalance.state.limitReservePct,
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
		}
	});
});