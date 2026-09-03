import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';

// Everything else in this package drives AlmPluginTest, a harness that overrides the four functions
// connecting the manager to its vault and pool. That leaves the shipped RebalanceManager untouched:
// its constructor derives a dozen stored fields from the vault, and none of those lines had ever run.
describe('RebalanceManager', function () {
  const TICK_SPACING = 60;
  const TOKEN0_DECIMALS = 6;
  const TOKEN1_DECIMALS = 18;

  // Valid thresholds, every case below starts from these and breaks one field at a time
  const THRESHOLDS = {
    depositTokenUnusedThreshold: 500,
    simulate: 9000,
    normalThreshold: 8000,
    underInventoryThreshold: 7000,
    overInventoryThreshold: 8500,
    priceChangeThreshold: 200,
    extremeVolatility: 900,
    highVolatility: 500,
    someVolatility: 200,
    dtrDelta: 300,
    baseLowPct: 3000,
    baseHighPct: 1500,
    limitReservePct: 500,
  };

  const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));

  async function deployFixture() {
    const [owner, manager, user] = await ethers.getSigners();

    const mockFactory = await (await ethers.getContractFactory('MockFactory')).deploy();
    const pool = await (await ethers.getContractFactory('MockAlmPool')).deploy(mockFactory.target, TICK_SPACING);

    // Asymmetric decimals, so every field derived from them is distinguishable from the others
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token0 = await MockERC20.deploy('Token0', 'T0', TOKEN0_DECIMALS);
    const token1 = await MockERC20.deploy('Token1', 'T1', TOKEN1_DECIMALS);

    // allowToken1 decides which side is the deposit token, so both wirings get their own vault
    const MockVault = await ethers.getContractFactory('MockVault');
    const vaultAllowingToken1 = await MockVault.deploy(pool.target, false, true);
    await vaultAllowingToken1.setTokens(token0.target, token1.target);

    const vaultAllowingToken0 = await MockVault.deploy(pool.target, true, false);
    await vaultAllowingToken0.setTokens(token0.target, token1.target);

    const RebalanceManager = await ethers.getContractFactory('RebalanceManager');
    const rebalanceManager = await RebalanceManager.deploy(vaultAllowingToken1.target, 3600, THRESHOLDS);

    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      user,
      mockFactory,
      pool,
      token0,
      token1,
      vaultAllowingToken1,
      vaultAllowingToken0,
      RebalanceManager,
      rebalanceManager,
    };
  }

  describe('Deployment', function () {
    it('should read the pool, factory and tick spacing off the vault', async function () {
      const { rebalanceManager, pool, mockFactory, vaultAllowingToken1 } = await loadFixture(deployFixture);

      expect(await rebalanceManager.vault()).to.equal(vaultAllowingToken1.target);
      expect(await rebalanceManager.pool()).to.equal(pool.target);
      expect(await rebalanceManager.factory()).to.equal(mockFactory.target);
      expect(await rebalanceManager.tickSpacing()).to.equal(TICK_SPACING);
      expect(await rebalanceManager.minTimeBetweenRebalances()).to.equal(3600);
    });

    it('should start unpaused, over inventory and with no rebalance recorded', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      expect(await rebalanceManager.paused()).to.be.false;
      // State.OverInventory is the first member of the enum
      expect(await rebalanceManager.state()).to.equal(0);
      expect(await rebalanceManager.lastRebalanceTimestamp()).to.equal(0);
      expect(await rebalanceManager.lastRebalanceCurrentPrice()).to.equal(0);
    });

    it('should take token1 as the deposit side when the vault allows token1', async function () {
      const { rebalanceManager, token0, token1 } = await loadFixture(deployFixture);

      expect(await rebalanceManager.allowToken1()).to.be.true;
      expect(await rebalanceManager.depositToken()).to.equal(token1.target);
      expect(await rebalanceManager.pairedToken()).to.equal(token0.target);
      expect(await rebalanceManager.depositTokenDecimals()).to.equal(TOKEN1_DECIMALS);
      expect(await rebalanceManager.pairedTokenDecimals()).to.equal(TOKEN0_DECIMALS);
      // tokenDecimals takes the paired side here, which is token0
      expect(await rebalanceManager.tokenDecimals()).to.equal(TOKEN0_DECIMALS);
      expect(await rebalanceManager.decimalsSum()).to.equal(TOKEN0_DECIMALS + TOKEN1_DECIMALS);
    });

    it('should take token0 as the deposit side when the vault allows token0', async function () {
      const { RebalanceManager, vaultAllowingToken0, token0, token1 } = await loadFixture(deployFixture);

      const manager = await RebalanceManager.deploy(vaultAllowingToken0.target, 3600, THRESHOLDS);

      expect(await manager.allowToken1()).to.be.false;
      expect(await manager.depositToken()).to.equal(token0.target);
      expect(await manager.pairedToken()).to.equal(token1.target);
      expect(await manager.depositTokenDecimals()).to.equal(TOKEN0_DECIMALS);
      expect(await manager.pairedTokenDecimals()).to.equal(TOKEN1_DECIMALS);
      // tokenDecimals takes the deposit side here, which is token0 again: the ternary picks whichever
      // side token0 happens to be on, so this value is the same in both wirings
      expect(await manager.tokenDecimals()).to.equal(TOKEN0_DECIMALS);
      expect(await manager.decimalsSum()).to.equal(TOKEN0_DECIMALS + TOKEN1_DECIMALS);
    });

    it('should store the thresholds it was given', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      const stored = await rebalanceManager.thresholds();
      expect(stored.simulate).to.equal(THRESHOLDS.simulate);
      expect(stored.normalThreshold).to.equal(THRESHOLDS.normalThreshold);
      expect(stored.underInventoryThreshold).to.equal(THRESHOLDS.underInventoryThreshold);
      expect(stored.overInventoryThreshold).to.equal(THRESHOLDS.overInventoryThreshold);
      expect(stored.baseLowPct).to.equal(THRESHOLDS.baseLowPct);
      expect(stored.baseHighPct).to.equal(THRESHOLDS.baseHighPct);
      expect(stored.limitReservePct).to.equal(THRESHOLDS.limitReservePct);
    });

    it('should reject the zero vault', async function () {
      const { RebalanceManager } = await loadFixture(deployFixture);

      await expect(RebalanceManager.deploy(ethers.ZeroAddress, 3600, THRESHOLDS)).to.be.revertedWith('Invalid vault address');
    });
  });

  // Every threshold rule, one broken field per case, so a failure names the rule that stopped working
  describe('Threshold validation', function () {
    const invalid: [string, Partial<typeof THRESHOLDS>, string][] = [
      ['priceChangeThreshold at the ceiling', { priceChangeThreshold: 10000 }, 'Invalid price change threshold'],
      ['underInventoryThreshold at the floor', { underInventoryThreshold: 6000 }, '_underInventoryThreshold must be > 6000'],
      [
        'normalThreshold equal to underInventoryThreshold',
        { normalThreshold: 7000 },
        '_normalThreshold must be > _underInventoryThreshold',
      ],
      [
        'overInventoryThreshold equal to normalThreshold',
        { overInventoryThreshold: 8000 },
        '_overInventoryThreshold must be > _normalThreshold',
      ],
      ['simulate equal to overInventoryThreshold', { simulate: 8500 }, 'Simulate must be > _overInventoryThreshold'],
      ['simulate at the ceiling', { simulate: 9500, overInventoryThreshold: 9400, normalThreshold: 9300, underInventoryThreshold: 9200 }, 'Simulate must be < 9500'],
      ['baseLowPct below the floor', { baseLowPct: 99 }, 'Invalid base low percent'],
      ['baseHighPct above the ceiling', { baseHighPct: 10001 }, 'Invalid base high percent'],
      ['limitReservePct above what simulate leaves', { limitReservePct: 1001 }, 'Invalid limit reserve percent'],
      ['dtrDelta above the ceiling', { dtrDelta: 10001 }, '_dtrDelta must be <= 10000'],
      ['highVolatility below someVolatility', { highVolatility: 100 }, '_highVolatility must be >= someVolatility'],
      ['someVolatility above the ceiling', { someVolatility: 301, highVolatility: 400 }, '_someVolatility must be <= 300'],
      ['extremeVolatility below highVolatility', { extremeVolatility: 400 }, '_extremeVolatility must be >= highVolatility'],
      [
        'depositTokenUnusedThreshold below the floor',
        { depositTokenUnusedThreshold: 99 },
        '_depositTokenUnusedThreshold must be 100 <= _depositTokenUnusedThreshold <= 10000',
      ],
    ];

    for (const [name, override, message] of invalid) {
      it(`should reject ${name}`, async function () {
        const { RebalanceManager, vaultAllowingToken1 } = await loadFixture(deployFixture);

        await expect(RebalanceManager.deploy(vaultAllowingToken1.target, 3600, { ...THRESHOLDS, ...override })).to.be.revertedWith(
          message
        );
      });
    }

    // Every rule above lives a second time in the setters, and only the constructor copy was ever
    // driven to its failing side. Two copies of the same fourteen rules that can drift apart, so the
    // setter copy is pinned too. Calls come from the manager, otherwise _authorize refuses first and
    // the case would pass without reaching the rule it names.
    const invalidBySetter: [string, (m: any) => Promise<any>, string][] = [
      ['priceChangeThreshold at the ceiling', (m) => m.setPriceChangeThreshold(10000), 'Invalid price change threshold'],
      ['baseLowPct below the floor', (m) => m.setPercentages(99, 1500, 500), 'Invalid base low percent'],
      ['baseLowPct above the ceiling', (m) => m.setPercentages(10001, 1500, 500), 'Invalid base low percent'],
      ['baseHighPct below the floor', (m) => m.setPercentages(3000, 99, 500), 'Invalid base high percent'],
      ['baseHighPct above the ceiling', (m) => m.setPercentages(3000, 10001, 500), 'Invalid base high percent'],
      ['limitReservePct below the floor', (m) => m.setPercentages(3000, 1500, 99), 'Invalid limit reserve percent'],
      // The ceiling is what the stored simulate leaves, 10000 - 9000, not a constant
      ['limitReservePct above what the stored simulate leaves', (m) => m.setPercentages(3000, 1500, 1001), 'Invalid limit reserve percent'],
      ['underInventoryThreshold at the floor', (m) => m.setTriggers(9000, 8000, 6000, 8500), '_underInventoryThreshold must be > 6000'],
      [
        'normalThreshold equal to underInventoryThreshold',
        (m) => m.setTriggers(9000, 7000, 7000, 8500),
        '_normalThreshold must be > _underInventoryThreshold',
      ],
      [
        'overInventoryThreshold equal to normalThreshold',
        (m) => m.setTriggers(9000, 8000, 7000, 8000),
        '_overInventoryThreshold must be > _normalThreshold',
      ],
      ['simulate equal to overInventoryThreshold', (m) => m.setTriggers(8500, 8000, 7000, 8500), 'Simulate must be > _overInventoryThreshold'],
      // Every earlier rule has to pass for this one to be the one that fires
      ['simulate at the ceiling', (m) => m.setTriggers(9500, 9300, 9200, 9400), 'Simulate must be < 9500'],
      ['dtrDelta above the ceiling', (m) => m.setDtrDelta(10001), '_dtrDelta must be <= 10000'],
      // Compared against the stored someVolatility, 200
      ['highVolatility below someVolatility', (m) => m.setHighVolatility(199), '_highVolatility must be >= someVolatility'],
      ['someVolatility above the ceiling', (m) => m.setSomeVolatility(301), '_someVolatility must be <= 300'],
      // Compared against the stored highVolatility, 500
      ['extremeVolatility below highVolatility', (m) => m.setExtremeVolatility(499), '_extremeVolatility must be >= highVolatility'],
      [
        'depositTokenUnusedThreshold below the floor',
        (m) => m.setDepositTokenUnusedThreshold(99),
        '_depositTokenUnusedThreshold must be 100 <= _depositTokenUnusedThreshold <= 10000',
      ],
      [
        'depositTokenUnusedThreshold above the ceiling',
        (m) => m.setDepositTokenUnusedThreshold(10001),
        '_depositTokenUnusedThreshold must be 100 <= _depositTokenUnusedThreshold <= 10000',
      ],
    ];

    for (const [name, call, message] of invalidBySetter) {
      it(`should reject ${name} through its setter`, async function () {
        const { rebalanceManager, manager } = await loadFixture(deployFixture);

        await expect(call(rebalanceManager.connect(manager))).to.be.revertedWith(message);
      });
    }

    it('should leave the stored thresholds untouched when a setter is rejected', async function () {
      const { rebalanceManager, manager } = await loadFixture(deployFixture);

      await expect(rebalanceManager.connect(manager).setPercentages(99, 1500, 500)).to.be.revertedWith('Invalid base low percent');

      const stored = await rebalanceManager.thresholds();
      expect(stored.baseLowPct).to.equal(THRESHOLDS.baseLowPct);
      expect(stored.baseHighPct).to.equal(THRESHOLDS.baseHighPct);
      expect(stored.limitReservePct).to.equal(THRESHOLDS.limitReservePct);
    });
  });

  // Every setter goes through _authorize, which asks the Algebra factory for the manager role
  describe('Authorization', function () {
    const guarded: [string, (m: any) => Promise<any>][] = [
      ['setPriceChangeThreshold', (m) => m.setPriceChangeThreshold(300)],
      ['setPercentages', (m) => m.setPercentages(3000, 1500, 500)],
      ['setTriggers', (m) => m.setTriggers(9000, 8000, 7000, 8500)],
      ['setDtrDelta', (m) => m.setDtrDelta(400)],
      ['setHighVolatility', (m) => m.setHighVolatility(600)],
      ['setSomeVolatility', (m) => m.setSomeVolatility(250)],
      ['setExtremeVolatility', (m) => m.setExtremeVolatility(1000)],
      ['setDepositTokenUnusedThreshold', (m) => m.setDepositTokenUnusedThreshold(600)],
      ['setMinTimeBetweenRebalances', (m) => m.setMinTimeBetweenRebalances(7200)],
      ['setVault', (m) => m.setVault(ethers.ZeroAddress)],
    ];

    for (const [name, call] of guarded) {
      it(`should refuse ${name} from a caller with neither ownership nor the role`, async function () {
        const { rebalanceManager, user } = await loadFixture(deployFixture);

        // _authorize is a require with no reason string, so this pins the guard and not some other revert
        await expect(call(rebalanceManager.connect(user))).to.be.revertedWithoutReason();
      });

      it(`should accept ${name} from the manager role`, async function () {
        const { rebalanceManager, manager } = await loadFixture(deployFixture);

        await expect(call(rebalanceManager.connect(manager))).to.not.be.reverted;
      });
    }

    it('should accept a setter from the factory owner without an explicit role', async function () {
      const { rebalanceManager, mockFactory, owner } = await loadFixture(deployFixture);

      expect(await mockFactory.owner()).to.equal(owner.address);
      await expect(rebalanceManager.setDtrDelta(400)).to.not.be.reverted;
    });
  });

  describe('Setters', function () {
    it('should store and announce a new price change threshold', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      await expect(rebalanceManager.setPriceChangeThreshold(300))
        .to.emit(rebalanceManager, 'SetPriceChangeThreshold')
        .withArgs(300);
      expect((await rebalanceManager.thresholds()).priceChangeThreshold).to.equal(300);
    });

    it('should store and announce new percentages', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      await expect(rebalanceManager.setPercentages(4000, 2500, 700))
        .to.emit(rebalanceManager, 'SetPercentages')
        .withArgs(4000, 2500, 700);

      const stored = await rebalanceManager.thresholds();
      expect(stored.baseLowPct).to.equal(4000);
      expect(stored.baseHighPct).to.equal(2500);
      expect(stored.limitReservePct).to.equal(700);
    });

    it('should store and announce new triggers', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      await expect(rebalanceManager.setTriggers(9100, 8100, 7100, 8600))
        .to.emit(rebalanceManager, 'SetTriggers')
        .withArgs(9100, 8100, 7100, 8600);

      const stored = await rebalanceManager.thresholds();
      expect(stored.simulate).to.equal(9100);
      expect(stored.normalThreshold).to.equal(8100);
      expect(stored.underInventoryThreshold).to.equal(7100);
      expect(stored.overInventoryThreshold).to.equal(8600);
    });

    it('should store and announce the single value setters', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      await expect(rebalanceManager.setDtrDelta(400)).to.emit(rebalanceManager, 'SetDtrDelta').withArgs(400);
      await expect(rebalanceManager.setExtremeVolatility(1000)).to.emit(rebalanceManager, 'SetExtremeVolatility').withArgs(1000);
      await expect(rebalanceManager.setHighVolatility(600)).to.emit(rebalanceManager, 'SetHighVolatility').withArgs(600);
      await expect(rebalanceManager.setSomeVolatility(250)).to.emit(rebalanceManager, 'SetSomeVolatility').withArgs(250);
      await expect(rebalanceManager.setDepositTokenUnusedThreshold(600))
        .to.emit(rebalanceManager, 'SetDepositTokenUnusedThreshold')
        .withArgs(600);
      await expect(rebalanceManager.setMinTimeBetweenRebalances(7200))
        .to.emit(rebalanceManager, 'SetMinTimeBetweenRebalances')
        .withArgs(7200);

      const stored = await rebalanceManager.thresholds();
      expect(stored.dtrDelta).to.equal(400);
      expect(stored.extremeVolatility).to.equal(1000);
      expect(stored.highVolatility).to.equal(600);
      expect(stored.someVolatility).to.equal(250);
      expect(stored.depositTokenUnusedThreshold).to.equal(600);
      expect(await rebalanceManager.minTimeBetweenRebalances()).to.equal(7200);
    });

    it('should store and announce a new vault', async function () {
      const { rebalanceManager, vaultAllowingToken0 } = await loadFixture(deployFixture);

      await expect(rebalanceManager.setVault(vaultAllowingToken0.target))
        .to.emit(rebalanceManager, 'SetVault')
        .withArgs(vaultAllowingToken0.target);
      expect(await rebalanceManager.vault()).to.equal(vaultAllowingToken0.target);
    });
  });

  describe('Rebalance entry point', function () {
    it('should only accept a call from the pool plugin', async function () {
      const { rebalanceManager, pool, user } = await loadFixture(deployFixture);

      await expect(rebalanceManager.connect(user).obtainTWAPAndRebalance(0, 0, 0, 0)).to.be.revertedWith(
        'Should only called by plugin'
      );

      await pool.setPlugin(user.address);
      await expect(rebalanceManager.connect(user).obtainTWAPAndRebalance(0, 0, 0, 0)).to.not.be.reverted;
    });

    // Detaching the vault is the manager's off switch, and it has to be silent rather than a revert:
    // the plugin calls this from afterSwap, so a revert here would stop every swap on the pool
    it('should return quietly once the vault is detached', async function () {
      const { rebalanceManager, pool, user } = await loadFixture(deployFixture);

      await pool.setPlugin(user.address);
      await rebalanceManager.setVault(ethers.ZeroAddress);

      await expect(rebalanceManager.connect(user).obtainTWAPAndRebalance(0, 0, 0, 0)).to.not.be.reverted;
    });
  });

  describe('Pause', function () {
    it('should refuse to unpause while it is not paused', async function () {
      const { rebalanceManager } = await loadFixture(deployFixture);

      expect(await rebalanceManager.paused()).to.be.false;
      await expect(rebalanceManager.unpause()).to.be.revertedWith('Already unpaused');
    });

    it('should refuse unpause from a caller with neither ownership nor the role', async function () {
      const { rebalanceManager, user } = await loadFixture(deployFixture);

      await expect(rebalanceManager.connect(user).unpause()).to.be.revertedWithoutReason();
    });
  });

  // Everything above stops at the guards. These drive the shipped manager through an actual rebalance,
  // with a real ERC20 balance on the vault instead of the number the harness stores for itself.
  describe('Rebalancing a live vault', function () {
    async function readyToRebalance() {
      const fixture = await loadFixture(deployFixture);
      const { rebalanceManager, pool, vaultAllowingToken1, token0, token1, user } = fixture;

      await pool.setPlugin(user.address);
      // Both sides funded, so totalDepositToken + totalPairedInDeposit is not zero
      await vaultAllowingToken1.setTotalAmounts(10n ** 12n, 10n ** 24n);
      await token0.mint(vaultAllowingToken1.target, 10n ** 10n);

      return { ...fixture, plugin: user };
    }

    // The deposit token balance is the one input the manager reads straight off the chain rather than
    // being told, so it can move between two calls without anybody touching the manager
    it('should see a deposit that arrived at the vault between two rebalances', async function () {
      const { rebalanceManager, vaultAllowingToken1, token1, plugin } = await readyToRebalance();

      await rebalanceManager.connect(plugin).obtainTWAPAndRebalance(0, 0, 0, 0);
      await time.increase(3600);

      // Nothing calls the manager here, a third party simply sends tokens to the vault
      await token1.mint(vaultAllowingToken1.target, 10n ** 24n);

      await expect(rebalanceManager.connect(plugin).obtainTWAPAndRebalance(0, 0, 0, 0)).to.emit(
        vaultAllowingToken1,
        'MockRebalance'
      );
    });

    it('should leave the vault alone on the second call while nothing arrived', async function () {
      const { rebalanceManager, vaultAllowingToken1, plugin } = await readyToRebalance();

      await rebalanceManager.connect(plugin).obtainTWAPAndRebalance(0, 0, 0, 0);
      await time.increase(3600);

      await expect(rebalanceManager.connect(plugin).obtainTWAPAndRebalance(0, 0, 0, 0)).to.not.emit(
        vaultAllowingToken1,
        'MockRebalance'
      );
    });

    it('should rebalance the vault on the first call', async function () {
      const { rebalanceManager, vaultAllowingToken1, plugin } = await readyToRebalance();

      await expect(rebalanceManager.connect(plugin).obtainTWAPAndRebalance(0, 0, 0, 0)).to.emit(
        vaultAllowingToken1,
        'MockRebalance'
      );

      expect(await rebalanceManager.lastRebalanceTimestamp()).to.not.equal(0);
      expect(await rebalanceManager.lastRebalanceCurrentPrice()).to.not.equal(0);
    });
  });

  // _getPriceAccountingDecimals turns a TWAP tick into a price in paired-token units. It is invisible
  // to the corpus in AlmPlugin.spec.ts, because AlmPluginTest overrides _getTwapPrices, its only
  // caller, so the shipped manager is the only way to reach it. It branches on which of the two tokens
  // sorts first, and only one of those orders was ever driven.
  describe('Price accounting', function () {
    // The vault decides which side is the deposit token, so the two fixture vaults are the two token
    // orders. Fresh manager per reading: the price is only stored by a rebalance that happens, and a
    // second call on one instance falls inside minTimeBetweenRebalances.
    async function priceAt(vault: any, tick: number, fixture: any) {
      const manager = await fixture.RebalanceManager.deploy(vault.target, 3600, THRESHOLDS);
      await vault.setTotalAmounts(10n ** 12n, 10n ** 24n);
      await fixture.token0.mint(vault.target, 10n ** 12n);
      await fixture.token1.mint(vault.target, 10n ** 24n);

      await manager.connect(fixture.user).obtainTWAPAndRebalance(tick, tick, tick, 0);
      return manager.lastRebalanceCurrentPrice();
    }

    const PARITY_TOKEN0 = 10n ** BigInt(TOKEN0_DECIMALS);
    const PARITY_TOKEN1 = 10n ** BigInt(TOKEN1_DECIMALS);

    it('should price a flat tick at one paired token per deposit token in either token order', async function () {
      const fixture = await loadFixture(deployFixture);
      await fixture.pool.setPlugin(fixture.user.address);

      // Tick 0 is a sqrt price of exactly 2**96, so the price is one paired token per deposit token
      // whichever way the two sort, and it reads as 10**6 one way and 10**18 the other because the
      // vaults swap which token is the paired one
      expect(await priceAt(fixture.vaultAllowingToken1, 0, fixture)).to.be.eq(PARITY_TOKEN0);
      expect(await priceAt(fixture.vaultAllowingToken0, 0, fixture)).to.be.eq(PARITY_TOKEN1);
    });

    // The case above cannot see which arm of the token-order branch ran: at tick 0 the sqrt price is
    // exactly 2**96, both arms compute the same number, and a swapped comparison passes it unchanged.
    // Off parity they divide in opposite directions, and that is what this pins.
    it('should move the price to opposite sides of parity for the two token orders', async function () {
      const fixture = await loadFixture(deployFixture);
      await fixture.pool.setPlugin(fixture.user.address);

      const TICK = 10000;
      const onToken1 = await priceAt(fixture.vaultAllowingToken1, TICK, fixture);
      const onToken0 = await priceAt(fixture.vaultAllowingToken0, TICK, fixture);

      // Which arm a vault takes is decided by the token addresses, and those are not fixed: loadFixture
      // re-runs the fixture when an earlier snapshot is reverted to, and the redeploy lands on a
      // different nonce. So derive the expected direction rather than hardcoding it. The multiplying
      // arm is the one where the paired token sorts before the deposit token.
      const token0First = BigInt(await fixture.token0.getAddress()) < BigInt(await fixture.token1.getAddress());

      if (token0First) {
        // vaultAllowingToken1 pairs token0 against a token1 deposit, so it multiplies and rises
        expect(onToken1).to.be.greaterThan(PARITY_TOKEN0);
        expect(onToken0).to.be.lessThan(PARITY_TOKEN1);
      } else {
        expect(onToken1).to.be.lessThan(PARITY_TOKEN0);
        expect(onToken0).to.be.greaterThan(PARITY_TOKEN1);
      }

      // Each is the other's reciprocal about parity, so the product returns to the two parities
      // multiplied. A swapped comparison sends both the same way and breaks this outright.
      const product = onToken1 * onToken0;
      const parityProduct = PARITY_TOKEN0 * PARITY_TOKEN1;
      expect(product).to.be.greaterThan((parityProduct * 9999n) / 10000n);
      expect(product).to.be.lessThan((parityProduct * 10001n) / 10000n);
    });
  });
});
