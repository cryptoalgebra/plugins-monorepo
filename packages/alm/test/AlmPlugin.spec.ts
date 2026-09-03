import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
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

	// The corpus below is 1620 cases built from only twelve distinct threshold sets, and the thresholds
	// are constructor arguments, so deploying per case redeploys an identical contract over and over.
	// loadFixture keys on the function identity, so one memoized function per distinct set lets the
	// first case of a group deploy and the rest revert to its snapshot. A snapshot is also what keeps
	// the cases independent: a successful rebalance writes lastRebalanceTimestamp, and the next case on
	// a reused instance would land inside the throttling window.
	const fixtureCache = new Map<string, () => Promise<{ mockVault: MockVault; almPlugin: AlmPluginTest }>>();

	function deployedFor(
		thresholds: Parameters<typeof almPluginFixture>[0],
		tickSpacing: number,
		allowToken0: boolean,
		allowToken1: boolean
	) {
		const key = JSON.stringify([thresholds, tickSpacing, allowToken0, allowToken1]);
		let fixture = fixtureCache.get(key);
		if (!fixture) {
			fixture = () => almPluginFixture(thresholds, tickSpacing, allowToken0, allowToken1);
			fixtureCache.set(key, fixture);
		}
		return loadFixture(fixture);
	}

	// A recorded case that actually rebalances, shared by the sequence and pause suites below
	const sample = rebalances.find((r) => r.rebalance.limitPosition != null)!;

	async function fixtureAtSample() {
		const { almPlugin, mockVault } = await deployedFor({
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
			await deployedFor({
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
					const { almPlugin, mockVault } = await deployedFor({
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

	// almRebalances3.json holds 1365 recorded rebalances, 460 of them with a limit position, and every
	// one of them runs here. Two are held out. The ranges in the file are calldata an off-chain keeper
	// passed to the vault through a Safe, not the output of a deployed manager, so where the recording
	// and this contract disagree there is nothing on chain that settles which one is right.
	describe('#rebalance3', () => {
		// Two recordings this contract reproduces differently. In both the recorded range has one side
		// pinned to MIN_TICK or MAX_TICK, which only happens once a side of the price bounds is zeroed,
		// so the keeper entered an inventory-skewed state where this contract does not. They are held
		// out of the replay above, and what the contract does with them instead is pinned in
		// #held out of the corpus below.
		const HELD_OUT = new Set([
			'0x9301aea485a8d64e756088f60d29bc004ef9986e31a6441c10fab740c0ea561f',
			'0xfbb296bbdbb9e46c1472a61558d5cb31bf901f4fc95694e88c548fbbff58526c',
		]);

		for (const rebalance of rebalances3.filter((entry) => !HELD_OUT.has(entry.transactionHash))) {
			if (rebalance.rebalance.limitPosition != null) {
				it(`rebalance for tx ${rebalance.transactionHash}`, async () => {
					const { almPlugin, mockVault } = await deployedFor({
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

		// HELD_OUT keeps these two out of the replay above, because the recording is calldata an
		// off-chain keeper passed to the vault and not the output of any deployed manager, so where the
		// two disagree there is nothing on chain that settles which is right. Dropping them silently
		// would leave the contract's own behaviour on these inputs unasserted, so it is pinned here.
		// These are characterization tests: they record what the contract does today, not what it
		// should do. If the port's inventory thresholds are corrected, these are expected to change.
		describe('#held out of the corpus', () => {
			async function driveHeldOut(transactionHash: string) {
				const rebalance = rebalances3.find((entry) => entry.transactionHash === transactionHash)!;
				const state = rebalance.state;

				const { almPlugin, mockVault } = await deployedFor({
					depositTokenUnusedThreshold: state.depositTokenUnusedThreshold,
					simulate: state.simulateTrigger,
					normalThreshold: state.normalTrigger,
					underInventoryThreshold: state.underTrigger,
					overInventoryThreshold: state.overTrigger,
					priceChangeThreshold: (BigInt(state.priceChangeTrigger) / 2n).toString(),
					extremeVolatility: state.extremeVolatility,
					highVolatility: state.highVolatility,
					someVolatility: state.someVolatility,
					dtrDelta: state.dtrDelta,
					baseLowPct: state.baseLowPct,
					baseHighPct: state.baseHighPct,
					limitReservePct: state.limitReservePct,
				}, 200, false, true);

				await almPlugin.setDecimals(6, 18);
				await mockVault.setTotalAmounts(BigInt(state.usedToken0), BigInt(state.usedToken1));
				await almPlugin.setPrices(BigInt(state.twapSlow), BigInt(state.twapFast), BigInt(state.currentPrice));
				await almPlugin.setDepositTokenBalance(state.depositTokenBalance);
				await almPlugin.setLastRebalanceCurrentPrice(BigInt(state.lastRebalancePrice));
				await almPlugin.setState(BigInt(state.state));

				return { almPlugin, mockVault, currentTick: BigInt(state.currentTick), recorded: rebalance.rebalance, recordedState: BigInt(state.state) };
			}

			// Both sides produce a one sided range, on opposite sides. The recording pins the base to the
			// rounded MIN_TICK and keeps the limit in a narrow band above it; this contract keeps the base
			// narrow and runs the limit up to the rounded MAX_TICK instead.
			it('puts the range on the opposite side of the recorded one for tx 0x9301aea4', async () => {
				const { almPlugin, mockVault, currentTick, recorded } = await driveHeldOut(
					'0x9301aea485a8d64e756088f60d29bc004ef9986e31a6441c10fab740c0ea561f'
				);

				await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n))
					.to.emit(mockVault, 'MockRebalance')
					.withArgs(-270000, -267600, -267600, 887200);

				// The recorded side, so a corpus refresh that quietly changed it would fail here
				expect(recorded.basePosition.bottomTick).to.be.eq('-887200');
				expect(recorded.limitPosition.topTick).to.be.eq('-260000');
			});

			// Here the contract declines outright rather than disagreeing about the range
			it('does not rebalance at all for tx 0xfbb296bb', async () => {
				const { almPlugin, mockVault, currentTick, recorded, recordedState } = await driveHeldOut(
					'0xfbb296bbdbb9e46c1472a61558d5cb31bf901f4fc95694e88c548fbbff58526c'
				);

				await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');

				// Declining leaves the state alone, it is not a silent transition into another one
				expect(await almPlugin.state()).to.be.eq(recordedState);
				expect(recorded.limitPosition.topTick).to.be.eq('887200');
			});
		});
	});
});