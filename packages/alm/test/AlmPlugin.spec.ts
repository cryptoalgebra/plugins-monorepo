import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AlmPluginTest, MockVault } from '../typechain';
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

	// A recorded case that actually rebalances, shared by the sequence and pause suites below
	const sample = rebalances.find((r) => r.rebalance.limitPosition != null)!;

	async function fixtureAtSample() {
		const { almPlugin, mockVault } = await almPluginFixture({
			depositTokenUnusedThreshold: sample.state.depositTokenUnusedThreshold,
			simulate: sample.state.simulateTrigger,
			normalThreshold: sample.state.normalTrigger,
			underInventoryThreshold: sample.state.underTrigger,
			overInventoryThreshold: sample.state.overTrigger,
			priceChangeThreshold: (BigInt(sample.state.priceChangeTrigger) / 2n).toString(),
			extremeVolatility: sample.state.extremeVolatility,
			highVolatility: sample.state.highVolatility,
			someVolatility: sample.state.someVolatility,
			dtrDelta: sample.state.dtrDelta,
			baseLowPct: sample.state.baseLowPct,
			baseHighPct: sample.state.baseHighPct,
			limitReservePct: sample.state.limitReservePct,
		}, 60, true, false);

		await almPlugin.setDecimals(18, 18);
		await mockVault.setTotalAmounts(BigInt(sample.state.usedToken0), BigInt(sample.state.usedToken1));
		await almPlugin.setPrices(BigInt(sample.state.twapSlow), BigInt(sample.state.twapFast), BigInt(sample.state.currentPrice));
		await almPlugin.setDepositTokenBalance(sample.state.depositTokenBalance);
		await almPlugin.setLastRebalanceCurrentPrice(BigInt(sample.state.lastRebalancePrice));
		await almPlugin.setState(BigInt(sample.state.state));

		return { almPlugin, mockVault, currentTick: BigInt(sample.state.currentTick) };
	}

	describe('#initializeALM', () => {
		it("can initialize", async () => {
			await almPluginFixture({
				depositTokenUnusedThreshold: 100,
				simulate: 9400, // 9300
				normalThreshold: 8100, // 8000
				underInventoryThreshold: 7800, // 7700
				overInventoryThreshold: 9100,
				priceChangeThreshold: 100,
				extremeVolatility: 2500,
				highVolatility: 900, //  500
				someVolatility: 200, // 100
				dtrDelta: 300,
				baseLowPct: 3000, // 2000
				baseHighPct: 1500, // 3000
				limitReservePct: 500,
			}, 228, true, false);
		});
	});

	describe('#rebalance1', () => {
		for (const rebalance of rebalances) {
			if (rebalance.rebalance.limitPosition != null) {
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
		}
	});

	// The manager is a state machine, but every corpus case injects a state and does one rebalance, so
	// nothing ever reads back what a rebalance itself wrote. These drive two in a row on one instance.
	describe('#consecutive rebalances', () => {
		it('records its own timestamp and price on the first rebalance', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();

			expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(0);

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');

			// Both written by the rebalance itself, not by a setter
			expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(await time.latest());
			expect(await almPlugin.lastRebalanceCurrentPrice()).to.not.be.eq(BigInt(sample.state.lastRebalancePrice));
		});

		// minTimeBetweenRebalances only means anything across two calls, and with lastRebalanceTimestamp
		// left at zero the window is always in the distant past, so this guard had never held anyone back
		it('refuses a second rebalance inside minTimeBetweenRebalances', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();

			await almPlugin.rebalance(currentTick, 0n, 0n, 0n);
			const firstTimestamp = await almPlugin.lastRebalanceTimestamp();

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(firstTimestamp);
		});

		it('allows the next rebalance once the window has passed', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();

			await almPlugin.rebalance(currentTick, 0n, 0n, 0n);
			const firstTimestamp = await almPlugin.lastRebalanceTimestamp();

			// The fixture builds the manager with a 7200 second window
			await time.increase(7200);
			await almPlugin.setState(BigInt(sample.state.state));

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.lastRebalanceTimestamp()).to.be.greaterThan(firstTimestamp);
		});
	});

	// The manager pauses itself when the vault refuses a rebalance, and unpause is the only way back.
	// Every other case here has a vault that always accepts, so neither half had ever run.
	describe('#pause', () => {
		it('pauses itself when the vault reverts the rebalance', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();
			await mockVault.setShouldRevertOnRebalance(true);

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.emit(almPlugin, 'Paused');

			expect(await almPlugin.paused()).to.be.true;
			// State.Special, the state the catch branch parks it in
			expect(await almPlugin.state()).to.be.eq(3);
		});

		it('does nothing at all while paused, even with a working vault', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();
			await mockVault.setShouldRevertOnRebalance(true);
			await almPlugin.rebalance(currentTick, 0n, 0n, 0n);

			await mockVault.setShouldRevertOnRebalance(false);

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.paused()).to.be.true;
		});

		it('rebalances again once unpaused', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();
			await mockVault.setShouldRevertOnRebalance(true);
			await almPlugin.rebalance(currentTick, 0n, 0n, 0n);

			await mockVault.setShouldRevertOnRebalance(false);

			// unpause is the one authorized entry point here, and the base asks the Algebra factory
			const mockFactory = await (await ethers.getContractFactory('MockFactory')).deploy();
			await almPlugin.setFactory(await mockFactory.getAddress());

			await expect(almPlugin.unpause()).to.emit(almPlugin, 'Unpaused');
			expect(await almPlugin.paused()).to.be.false;

			// The catch branch left it in Special, so put it back where the recorded case started
			await almPlugin.setState(BigInt(sample.state.state));
			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
		});
	});

	// almRebalances3.json holds 1365 recorded rebalances, 460 of them with a limit position, and each
	// case costs about 300ms. Running all of them would add over two minutes, so the suite takes a
	// sample. The stride spreads it over the whole file, so the cases cover the full recorded history
	// instead of one contiguous stretch of it the way a prefix slice did.
	describe('#rebalance3', () => {
		const REBALANCE3_STRIDE = 8;

		for (const rebalance of rebalances3.filter((_, index) => index % REBALANCE3_STRIDE === 0)) {
			if (rebalance.rebalance.limitPosition != null) {
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
		}
	});
});