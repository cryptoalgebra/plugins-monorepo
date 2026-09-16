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

	// A recorded state as the single harness call that injects it, which the two corpora make two thousand times over
	const readingOf = (state: any, depositDecimals: number, pairedDecimals: number) => ({
		depositDecimals,
		pairedDecimals,
		totalAmount0: BigInt(state.usedToken0),
		totalAmount1: BigInt(state.usedToken1),
		slowPrice: BigInt(state.twapSlow),
		fastPrice: BigInt(state.twapFast),
		currentPrice: BigInt(state.currentPrice),
		depositTokenBalance: BigInt(state.depositTokenBalance),
		lastRebalanceCurrentPrice: BigInt(state.lastRebalancePrice),
		state: BigInt(state.state),
	});

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

		await almPlugin.setReading(readingOf(sample.state, 18, 18));

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

					await almPlugin.setReading(readingOf(state, 18, 18));

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

		// Only strictly inside the window is too soon, so the second it ends already admits the next rebalance
		it('allows the next rebalance at the very second the window ends', async () => {
			const { almPlugin, mockVault, currentTick } = await fixtureAtSample();

			await almPlugin.rebalance(currentTick, 0n, 0n, 0n);
			const firstTimestamp = await almPlugin.lastRebalanceTimestamp();
			await almPlugin.setState(BigInt(sample.state.state));

			await time.setNextBlockTimestamp(firstTimestamp + 7200n);
			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
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

	// Everything a reading can be refused for before the range builder runs: the guard on a zero price,
	// and the two volatility arms of _decideRebalance. None of the three had a named case. The same-block
	// brake was unreachable from every suite, because a recorded lastBlockTimestamp never matches the
	// block a test mines, and the extreme volatility arm is only reached incidentally by the property.
	describe('#volatility arms', () => {
		const thresholds = {
			depositTokenUnusedThreshold: sample.state.depositTokenUnusedThreshold,
			simulate: sample.state.simulateTrigger,
			normalThreshold: sample.state.normalTrigger,
			underInventoryThreshold: sample.state.underTrigger,
			overInventoryThreshold: sample.state.overTrigger,
			priceChangeThreshold: sample.state.priceChangeTrigger,
			extremeVolatility: sample.state.extremeVolatility,
			highVolatility: sample.state.highVolatility,
			someVolatility: sample.state.someVolatility,
			dtrDelta: sample.state.dtrDelta,
			baseLowPct: sample.state.baseLowPct,
			baseHighPct: sample.state.baseHighPct,
			limitReservePct: sample.state.limitReservePct,
		};

		// someVolatility is 2%, highVolatility 9% and extremeVolatility 25%, so this trio sits high but
		// not extreme: the slow and fast prices are 10.7% apart and the fast and current 2.7%.
		const SLOW = 100n * 10n ** 18n;
		const FAST = 112n * 10n ** 18n;
		const CURRENT = 109n * 10n ** 18n;
		// 28.5% apart, over the extreme threshold
		const EXTREME_FAST = 140n * 10n ** 18n;

		const TICK = 1200n;

		async function deployed(state: number, prices: [bigint, bigint, bigint] = [SLOW, FAST, CURRENT]) {
			const { almPlugin, mockVault } = await deployedFor(thresholds, 60, true, false);

			await almPlugin.setDecimals(18, 18);
			await mockVault.setTotalAmounts(10n ** 22n, 10n ** 22n);
			await almPlugin.setPrices(prices[0], prices[1], prices[2]);
			await almPlugin.setState(BigInt(state));

			return { almPlugin, mockVault };
		}

		// The argument names the same block the call is mined in, which is the only way twapResult.sameBlock
		// comes out true. Nothing in the contract says what it takes that to mean, so this pins the effect
		// rather than a reading of the intent.
		it('refuses to act on a high volatility reading from the same block', async () => {
			const { almPlugin, mockVault } = await deployed(1); // State.Normal

			// The argument has to equal the timestamp of the block the call is mined in, so pin that
			// rather than passing whatever time.latest() reported before the transaction
			const sameBlock = (await time.latest()) + 1;
			await time.setNextBlockTimestamp(sameBlock);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, sameBlock)).to.not.emit(mockVault, 'MockRebalance');
			// It returns before the transition at the end of the high volatility branch, so the state it
			// was in survives
			expect(await almPlugin.state()).to.be.eq(1);
		});

		// The same reading one block later, which is the half that makes the case above mean something
		it('parks itself in Special for the same reading from an earlier block', async () => {
			const { almPlugin, mockVault } = await deployed(1);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.state()).to.be.eq(3);
		});

		it('closes the vault to deposits and pauses on extreme volatility', async () => {
			const { almPlugin, mockVault } = await deployed(1, [SLOW, EXTREME_FAST, CURRENT]);
			// Seed both caps so writing zero is a change and not the value they already held
			await mockVault.setDepositMax(10n ** 20n, 10n ** 20n);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n))
				.to.emit(mockVault, 'MockDepositMax')
				.withArgs(0n, 0n);

			expect(await mockVault.deposit0Max()).to.be.eq(0);
			expect(await mockVault.deposit1Max()).to.be.eq(0);
			expect(await almPlugin.paused()).to.be.true;
			expect(await almPlugin.state()).to.be.eq(3);
		});

		it('does not rebalance on extreme volatility', async () => {
			const { almPlugin, mockVault } = await deployed(1, [SLOW, EXTREME_FAST, CURRENT]);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		// A price of zero is what _getTwapPrices returns when the pool has no history to average, and
		// every downstream percentage divides by one of the three. Each is its own arm of the guard.
		for (const [name, prices] of [
			['slow', [0n, FAST, CURRENT]],
			['fast', [SLOW, 0n, CURRENT]],
			['current', [SLOW, FAST, 0n]],
		] as [string, [bigint, bigint, bigint]][]) {
			it(`returns without deciding anything when the ${name} price is zero`, async () => {
				const { almPlugin, mockVault } = await deployed(1, prices);

				await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
				// It returns before _decideRebalance, so not even the high volatility transition happened
				expect(await almPlugin.state()).to.be.eq(1);
			});
		}
	});

	// The manager refuses to call a vault it cannot pay for, and the guard is an absolute floor rather
	// than a share of the budget, so it only shows up when the caller sets a limit of its own. The check
	// sits after the range builder and the width guard, so reaching it at all proves the whole path ran.
	describe('#gas floor', () => {
		// Any limit under the floor fails the check, since gasleft() can never exceed the limit the caller
		// set. 1.5M is picked to leave room for the path under coverage instrumentation, which costs more
		// gas to reach the same line, so the case runs in both modes rather than being tagged out of one.
		it('refuses a rebalance that would arrive with less than the reserve', async () => {
			const { almPlugin, currentTick } = await fixtureAtSample();

			await expect(almPlugin.rebalance(currentTick, 0n, 0n, 0n, { gasLimit: 1_500_000 })).to.be.revertedWith(
				'Not enough gas left'
			);
		});
	});

	// A range narrower than 300 ticks is dropped rather than handed to the vault, and the check covers
	// the base and the limit side separately. Only the limit side had ever tripped it: the recorded
	// threshold sets carry a baseLowPct between 20% and 50%, so the base range is thousands of ticks
	// wide before rounding and never comes close to the floor.
	describe('#range width floor', () => {
		function thresholdsWithBaseLow(baseLowPct: number) {
			return {
				depositTokenUnusedThreshold: sample.state.depositTokenUnusedThreshold,
				simulate: sample.state.simulateTrigger,
				normalThreshold: sample.state.normalTrigger,
				underInventoryThreshold: sample.state.underTrigger,
				overInventoryThreshold: sample.state.overTrigger,
				priceChangeThreshold: sample.state.priceChangeTrigger,
				extremeVolatility: sample.state.extremeVolatility,
				highVolatility: sample.state.highVolatility,
				someVolatility: sample.state.someVolatility,
				dtrDelta: sample.state.dtrDelta,
				baseLowPct,
				baseHighPct: sample.state.baseHighPct,
				limitReservePct: sample.state.limitReservePct,
			};
		}

		// Flat prices so the reading is not volatile, and State.Special so _updateStatus skips the block it
		// keeps for a manager that already has a state to reason from and answers off the holdings alone.
		// A deposit share of 85% is what makes that answer State.Normal. The
		// limit side of the range runs to the rounded MIN_TICK in that state, so only the base side is in
		// question and baseLowPct alone decides how wide it is.
		async function deployedWithBaseLow(baseLowPct: number) {
			const { almPlugin, mockVault } = await deployedFor(thresholdsWithBaseLow(baseLowPct), 60, true, false);

			await almPlugin.setDecimals(18, 18);
			await mockVault.setTotalAmounts(10n ** 22n, 17647n * 10n ** 15n);
			const price = 100n * 10n ** 18n;
			await almPlugin.setPrices(price, price, price);
			await almPlugin.setState(3n); // State.Special

			return { almPlugin, mockVault };
		}

		it('drops a rebalance whose base range is narrower than the floor', async () => {
			const { almPlugin, mockVault } = await deployedWithBaseLow(100); // 1%, about 100 ticks

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		it('hands over the same rebalance once the base range is wide enough', async () => {
			const { almPlugin, mockVault } = await deployedWithBaseLow(3000); // 30%, what the sampled recording carries

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
		});
	});

	// A vault with nothing on its deposit side is a state the manager checks for and declines to act on,
	// and the guard is load bearing: _getPriceBounds divides by totalDepositToken. No recording is in it,
	// all 2990 across the two corpora have a funded deposit side, though three do have an empty paired
	// side. The empty vault below is reached by the property from time to time but by no named case.
	describe('#degenerate holdings', () => {
		const thresholds = {
			depositTokenUnusedThreshold: sample.state.depositTokenUnusedThreshold,
			simulate: sample.state.simulateTrigger,
			normalThreshold: sample.state.normalTrigger,
			underInventoryThreshold: sample.state.underTrigger,
			overInventoryThreshold: sample.state.overTrigger,
			priceChangeThreshold: sample.state.priceChangeTrigger,
			extremeVolatility: sample.state.extremeVolatility,
			highVolatility: sample.state.highVolatility,
			someVolatility: sample.state.someVolatility,
			dtrDelta: sample.state.dtrDelta,
			baseLowPct: sample.state.baseLowPct,
			baseHighPct: sample.state.baseHighPct,
			limitReservePct: sample.state.limitReservePct,
		};

		async function deployedHolding(amount0: bigint, amount1: bigint) {
			const { almPlugin, mockVault } = await deployedFor(thresholds, 60, true, false);

			await almPlugin.setDecimals(18, 18);
			await mockVault.setTotalAmounts(amount0, amount1);
			const price = 100n * 10n ** 18n;
			await almPlugin.setPrices(price, price, price);
			await almPlugin.setState(3n); // State.Special, so _updateStatus reads the holdings and nothing else

			return { almPlugin, mockVault };
		}

		// The deposit side is empty but the paired side is not, so the manager gets past the "holds
		// nothing at all" check and has to refuse on the second one instead
		it('declines a rebalance while the vault holds none of the deposit token', async () => {
			const { almPlugin, mockVault } = await deployedHolding(0n, 10n ** 20n);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		it('rebalances once the deposit side is funded', async () => {
			const { almPlugin, mockVault } = await deployedHolding(10n ** 22n, 10n ** 20n);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
		});

		it('declines a rebalance while the vault holds nothing at all', async () => {
			const { almPlugin, mockVault } = await deployedHolding(0n, 0n);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});
	});

	// A Normal state rebalance is skipped when the paired holdings are no more than the limit reserve.
	// That guard is load bearing too: _getPriceBounds subtracts the reserve from the paired total in
	// checked arithmetic, so without it the call would revert on the underflow. Reaching it needs the
	// reserve set to everything the simulate trigger leaves, since below that the deposit share the
	// Normal state requires and the paired share the guard requires cannot both hold.
	describe('#limit reserve floor', () => {
		function thresholdsWithLimitReserve(limitReservePct: number) {
			return {
				depositTokenUnusedThreshold: sample.state.depositTokenUnusedThreshold,
				simulate: sample.state.simulateTrigger,
				normalThreshold: sample.state.normalTrigger,
				underInventoryThreshold: sample.state.underTrigger,
				overInventoryThreshold: sample.state.overTrigger,
				priceChangeThreshold: sample.state.priceChangeTrigger,
				extremeVolatility: sample.state.extremeVolatility,
				highVolatility: sample.state.highVolatility,
				someVolatility: sample.state.someVolatility,
				dtrDelta: sample.state.dtrDelta,
				baseLowPct: sample.state.baseLowPct,
				baseHighPct: sample.state.baseHighPct,
				limitReservePct,
			};
		}

		// The reserve is 6%, which is exactly what a simulate trigger of 9400 leaves. The deposit side is
		// 9400 of 10000 too, so the paired side lands exactly on the reserve.
		async function deployedWithPaired(amount1: bigint) {
			const { almPlugin, mockVault } = await deployedFor(thresholdsWithLimitReserve(600), 60, true, false);

			await almPlugin.setDecimals(18, 18);
			await mockVault.setTotalAmounts(94n * 10n ** 20n, amount1);
			const price = 100n * 10n ** 18n;
			await almPlugin.setPrices(price, price, price);
			await almPlugin.setState(3n); // State.Special, so _updateStatus reads the holdings and nothing else

			return { almPlugin, mockVault };
		}

		it('leaves the vault alone when the paired side is exactly the reserve', async () => {
			// 6 * 10**18 of paired token at a price of 100 is 6 * 10**20, exactly 6% of the total
			const { almPlugin, mockVault } = await deployedWithPaired(6n * 10n ** 18n);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		it('rebalances once the paired side is over the reserve', async () => {
			const { almPlugin, mockVault } = await deployedWithPaired(7n * 10n ** 18n);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance');
		});
	});

	// Every comparison the decision makes is inclusive on one side, so these land a reading exactly on its threshold
	const BOUNDARY_THRESHOLDS = {
		depositTokenUnusedThreshold: 100,
		simulate: 9300,
		normalThreshold: 8000,
		underInventoryThreshold: 7700,
		overInventoryThreshold: 9100,
		priceChangeThreshold: 100,
		extremeVolatility: 2500,
		highVolatility: 900,
		someVolatility: 200,
		dtrDelta: 300,
		baseLowPct: 3000,
		baseHighPct: 1500,
		limitReservePct: 500,
	};
	// In State enum order
	const [OVER, NORMAL, UNDER, SPECIAL] = [0n, 1n, 2n, 3n];
	const E18 = 10n ** 18n;

	async function deployedWith(
		overrides: Partial<typeof BOUNDARY_THRESHOLDS>,
		allowToken1: boolean,
		state: bigint,
		amounts: [bigint, bigint],
		prices: [bigint, bigint, bigint]
	) {
		const { almPlugin, mockVault } = await deployedFor({ ...BOUNDARY_THRESHOLDS, ...overrides }, 60, !allowToken1, allowToken1);

		await almPlugin.setDecimals(18, 18);
		await mockVault.setTotalAmounts(amounts[0], amounts[1]);
		await almPlugin.setPrices(prices[0], prices[1], prices[2]);
		await almPlugin.setState(state);

		return { almPlugin, mockVault };
	}

	describe('#decision thresholds', () => {
		const PRICE = 100n * E18;
		const TICK = 1200n;

		// The deposit token holds depositShare of 10000, and at PRICE the paired side is exactly the rest
		const deployed = (state: bigint, depositShare: bigint, prices: [bigint, bigint, bigint] = [PRICE, PRICE, PRICE]) =>
			deployedWith({}, false, state, [depositShare * E18, ((10000n - depositShare) * E18) / 100n], prices);

		// 75 against 100 is 25% apart, exactly extremeVolatility, whichever two of the three prices it separates
		for (const [reading, prices] of [
			['a fast price that far off the slow one', [PRICE, 75n * E18, 75n * E18]],
			['a current price that far off the fast one', [PRICE, PRICE, 75n * E18]],
		] as [string, [bigint, bigint, bigint]][]) {
			it(`treats ${reading} as extreme volatility`, async () => {
				const { almPlugin, mockVault } = await deployed(NORMAL, 8500n, prices);

				await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockDepositMax').withArgs(0n, 0n);
				expect(await almPlugin.paused()).to.be.true;
			});
		}

		// 91 against 100 is 9% apart, exactly highVolatility, which parks the manager in Special
		it('treats a current price exactly highVolatility off the fast one as high', async () => {
			const { almPlugin, mockVault } = await deployed(NORMAL, 8500n, [PRICE, PRICE, 91n * E18]);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.state()).to.be.eq(SPECIAL);
		});

		// A slow price 9% under the fast one is high volatility, and a current price 2% off is exactly someVolatility
		it('refuses a same block high volatility reading whose current price is exactly someVolatility off', async () => {
			const { almPlugin, mockVault } = await deployed(NORMAL, 8500n, [91n * E18, PRICE, 98n * E18]);
			const sameBlock = (await time.latest()) + 1;
			await time.setNextBlockTimestamp(sameBlock);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, sameBlock)).to.not.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.state()).to.be.eq(NORMAL);
		});

		it('holds a rebalance back while the current price is exactly someVolatility off the fast one', async () => {
			const { almPlugin, mockVault } = await deployed(SPECIAL, 8500n, [PRICE, PRICE, 98n * E18]);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		it('rebalances once the current price is inside someVolatility of the fast one', async () => {
			const { almPlugin, mockVault } = await deployed(SPECIAL, 8500n, [PRICE, PRICE, 99n * E18]);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
		});

		// underInventoryThreshold - dtrDelta is 7400, and a share on it is not yet below
		it('lets a share exactly dtrDelta under the under inventory trigger through to the state update', async () => {
			const { almPlugin, mockVault } = await deployed(NORMAL, 7400n);
			await almPlugin.setLastRebalanceCurrentPrice(PRICE);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.state()).to.be.eq(UNDER);
		});

		// Title, starting state, whether a price was recorded, deposit share, and the state the rebalance has to leave
		const onTrigger: [string, bigint, boolean, bigint, bigint][] = [
			['puts a fresh share exactly at simulate in Normal', SPECIAL, false, 9300n, NORMAL],
			['puts a fresh share exactly at the under inventory trigger in Normal', SPECIAL, false, 7700n, NORMAL],
			['moves an under inventory manager with a share exactly at simulate to Normal', UNDER, true, 9300n, NORMAL],
			['moves an over inventory manager with a share exactly at the under inventory trigger to Normal', OVER, true, 7700n, NORMAL],
		];

		for (const [name, state, recorded, share, expected] of onTrigger) {
			it(name, async () => {
				const { almPlugin, mockVault } = await deployed(state, share);
				if (recorded) await almPlugin.setLastRebalanceCurrentPrice(PRICE);

				await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
				expect(await almPlugin.state()).to.be.eq(expected);
			});
		}

		// On the edge of its band a Normal manager has nothing to do, and records the reading without a rebalance
		for (const share of [9300n, 7700n]) {
			it(`leaves a Normal manager alone at a share of ${share}, on the edge of its band`, async () => {
				const { almPlugin, mockVault } = await deployed(NORMAL, share);
				await almPlugin.setLastRebalanceCurrentPrice(PRICE);

				await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
				expect(await almPlugin.state()).to.be.eq(NORMAL);
				expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(await time.latest());
			});
		}

		it('leaves a Normal manager alone while exactly depositTokenUnusedThreshold of the holdings sits unused', async () => {
			const { almPlugin, mockVault } = await deployed(NORMAL, 8500n);
			await almPlugin.setLastRebalanceCurrentPrice(PRICE);
			// 10**20 of a 10**22 total is 1%, exactly the threshold
			await almPlugin.setDepositTokenBalance(10n ** 20n);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(await time.latest());
		});

		it('rebalances a Normal manager once more than depositTokenUnusedThreshold sits unused', async () => {
			const { almPlugin, mockVault } = await deployed(NORMAL, 8500n);
			await almPlugin.setLastRebalanceCurrentPrice(PRICE);
			await almPlugin.setDepositTokenBalance(101n * E18);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
		});

		// 99 recorded against 100 now is 1% apart, exactly priceChangeThreshold
		it('leaves an under inventory manager alone after a price move of exactly priceChangeThreshold', async () => {
			const { almPlugin, mockVault } = await deployed(UNDER, 7500n);
			await almPlugin.setLastRebalanceCurrentPrice(99n * E18);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.not.emit(mockVault, 'MockRebalance');
			expect(await almPlugin.lastRebalanceTimestamp()).to.be.eq(await time.latest());
		});

		it('rebalances an under inventory manager after a larger price move', async () => {
			const { almPlugin, mockVault } = await deployed(UNDER, 7500n);
			await almPlugin.setLastRebalanceCurrentPrice(98n * E18);

			await expect(almPlugin.rebalance(TICK, TICK, TICK, 0n)).to.emit(mockVault, 'MockRebalance');
		});
	});

	describe('#range arithmetic', () => {
		// A predicate matches any value, for a tick the case is not about
		const anyTick = () => true;

		// A current price 9% off the fast one is high volatility, which builds both ranges off the current tick alone
		const HIGH: [bigint, bigint, bigint] = [100n * E18, 100n * E18, 91n * E18];
		const PARITY: [bigint, bigint, bigint] = [E18, E18, E18];

		it('ends the limit range one spacing under a round current tick when token0 is the deposit side', async () => {
			const { almPlugin, mockVault } = await deployedWith({}, false, NORMAL, [10n ** 22n, 10n ** 22n], HIGH);

			await expect(almPlugin.rebalance(1200n, 1200n, 1200n, 0n))
				.to.emit(mockVault, 'MockRebalance')
				.withArgs(1200, 887220, -887220, 1140);
		});

		it('starts the limit range one spacing over a round current tick when token1 is the deposit side', async () => {
			const { almPlugin, mockVault } = await deployedWith({}, true, NORMAL, [10n ** 22n, 10n ** 22n], HIGH);

			await expect(almPlugin.rebalance(1200n, 1200n, 1200n, 0n))
				.to.emit(mockVault, 'MockRebalance')
				.withArgs(-887220, 1200, 1260, 887220);
		});

		// A 95% deposit share is over inventory, and its ranges are swapped at the end, so the base upper bound
		// built one spacing under the current tick comes out as the limit upper bound
		it('ends the limit range one spacing under a round current tick on an over inventory rebalance', async () => {
			const price = 100n * E18;
			const { almPlugin, mockVault } = await deployedWith({}, true, SPECIAL, [5n * E18, 9500n * E18], [price, price, price]);

			await expect(almPlugin.rebalance(46080n, 46080n, 46080n, 0n))
				.to.emit(mockVault, 'MockRebalance')
				.withArgs(46080, 887220, anyTick, 46020);
		});

		// At parity the target sits on tick 0, since the paired side is over the reserve by too little to move it.
		// A 4% lower price bound then rounds to tick 360 and a 3.2% one to tick 300, the width of the base range.
		it('hands over a base range 360 ticks wide', async () => {
			const { almPlugin, mockVault } = await deployedWith({ limitReservePct: 700, baseLowPct: 400 }, false, SPECIAL, [9299n * E18, 701n * E18], PARITY);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.emit(mockVault, 'MockRebalance').withArgs(0, 360, -887220, 0);
		});

		it('drops a base range exactly 300 ticks wide', async () => {
			const { almPlugin, mockVault } = await deployedWith({ limitReservePct: 700, baseLowPct: 320 }, false, SPECIAL, [9299n * E18, 701n * E18], PARITY);

			await expect(almPlugin.rebalance(0n, 0n, 0n, 0n)).to.not.emit(mockVault, 'MockRebalance');
		});

		// Over inventory at parity, the limit range runs from a spacing over the current tick to a spacing over
		// the lower price bound at tick 3540, so the current tick alone sets its width
		it('hands over a limit range 360 ticks wide', async () => {
			const { almPlugin, mockVault } = await deployedWith({}, false, SPECIAL, [9500n * E18, 500n * E18], PARITY);

			await expect(almPlugin.rebalance(3181n, 3181n, 3181n, 0n)).to.emit(mockVault, 'MockRebalance').withArgs(-887220, 3240, 3240, 3600);
		});

		it('drops a limit range exactly 300 ticks wide', async () => {
			const { almPlugin, mockVault } = await deployedWith({}, false, SPECIAL, [9500n * E18, 500n * E18], PARITY);

			await expect(almPlugin.rebalance(3241n, 3241n, 3241n, 0n)).to.not.emit(mockVault, 'MockRebalance');
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

					await almPlugin.setReading(readingOf(state, 6, 18));

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

				await almPlugin.setReading(readingOf(state, 6, 18));

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