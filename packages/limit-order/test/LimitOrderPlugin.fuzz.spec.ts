import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fc from 'fast-check';
import { ZeroAddress } from 'ethers';
import {
  abi as TICK_MATH_ABI,
  bytecode as TICK_MATH_BYTECODE,
} from '@cryptoalgebra/integral-core/artifacts/contracts/test/TickMathTest.sol/TickMathTest.json';

import { limitOrderPluginFixture } from './limitOrderFixture';

// Every property runs from a fixed seed, so a failure is reproducible. FUZZ_SEED and FUZZ_RUNS widen a search by hand.
const fuzz = { seed: Number(process.env.FUZZ_SEED ?? 20260903), numRuns: Number(process.env.FUZZ_RUNS ?? 50) };

const SPACING = 60;
// Pool liquidity spans [-RANGE, RANGE], so every swap the model makes stays priced
const RANGE = 1200;

type Order = {
  id: bigint;
  tickLower: number;
  zeroForOne: boolean;
  filled: boolean;
  total: bigint;
  liquidity: bigint[];
  // What the epoch still holds for its owners once filled
  remaining?: [bigint, bigint];
};
type Model = { initialized: boolean; epochNext: bigint; active: Map<string, Order>; epochs: Order[] };
type Real = Awaited<ReturnType<typeof modelFixture>>;

const keyOf = (tickLower: number, zeroForOne: boolean) => `${tickLower}:${zeroForOne}`;
const floorToSpacing = (tick: number) => Math.floor(tick / SPACING) * SPACING;

// Aiming only some draws at a filled order reaches paths a uniform pick almost never does, and keeps the refusals reachable
const pickFrom = (orders: Order[], pick: number, preferFilled: boolean) => {
  const filled = orders.filter((order) => order.filled);
  const candidates = preferFilled && filled.length > 0 ? filled : orders;
  return candidates[pick % candidates.length];
};

// Summed over every run, so a generator that stops reaching a path fails the suite instead of passing vacuously
const reached = { fills: 0, kills: 0, withdraws: 0, killsAfterFill: 0, withdrawsBeforeFill: 0 };

async function modelFixture() {
  const base = await limitOrderPluginFixture();
  const [wallet, other] = await ethers.getSigners();
  const { loModule, token0, token1, pool, swapTarget } = base;

  const tickMath = (await (await ethers.getContractFactory(TICK_MATH_ABI, TICK_MATH_BYTECODE)).deploy()) as any;

  await pool.initialize(await tickMath.getSqrtRatioAtTick(0));
  for (const token of [token0, token1]) {
    await token.approve(loModule, 2n ** 255n);
    await token.approve(swapTarget, 2n ** 255n);
    await token.transfer(other, 10n ** 12n);
    await token.connect(other).approve(loModule, 2n ** 255n);
  }
  await swapTarget.mint(pool, wallet, -RANGE, RANGE, 10n ** 10n);

  const poolKey = { token0: await token0.getAddress(), token1: await token1.getAddress(), deployer: ZeroAddress };
  return { ...base, tickMath, poolKey, actors: [wallet, other] };
}

async function currentTick(real: Real): Promise<number> {
  return Number((await real.pool.globalState()).tick);
}

async function assertMatches(model: Model, real: Real) {
  const pool = await real.pool.getAddress();
  expect(await real.loModule.epochNext(), 'epochNext').to.equal(model.epochNext);

  for (const order of model.epochs) {
    const info = await real.loModule.epochInfos(order.id);
    expect(info.filled, `epoch ${order.id} filled`).to.equal(order.filled);
    expect(info.liquidityTotal, `epoch ${order.id} liquidityTotal`).to.equal(order.total);
    for (const [index, actor] of real.actors.entries()) {
      expect(await real.loModule.getEpochLiquidity(order.id, actor), `epoch ${order.id} owner ${index}`).to.equal(order.liquidity[index]);
    }
    const mapped = await real.loModule.getEpoch(pool, order.tickLower, order.tickLower + SPACING, order.zeroForOne);
    const expected = model.active.get(keyOf(order.tickLower, order.zeroForOne))?.id ?? 0n;
    expect(mapped, `ticks of epoch ${order.id}`).to.equal(expected);
    if (order.remaining) {
      expect(info.token0Total, `epoch ${order.id} token0 left`).to.equal(order.remaining[0]);
      expect(info.token1Total, `epoch ${order.id} token1 left`).to.equal(order.remaining[1]);
    }
  }

  // Every token passes straight through the manager, so it never holds a balance between calls
  expect(await real.token0.balanceOf(real.loModule), 'manager token0').to.equal(0n);
  expect(await real.token1.balanceOf(real.loModule), 'manager token1').to.equal(0n);
}

class Place implements fc.AsyncCommand<Model, Real> {
  constructor(readonly actor: number, readonly zeroForOne: boolean, readonly distance: number, readonly liquidity: bigint) {}

  check() {
    return true;
  }

  async run(model: Model, real: Real) {
    const tick = await currentTick(real);
    // Strictly clear of the current price, so the order is funded from a single token
    const tickLower = this.zeroForOne
      ? floorToSpacing(tick) + this.distance * SPACING
      : floorToSpacing(tick) - (this.distance + 1) * SPACING;

    await real.loModule.connect(real.actors[this.actor]).place(real.poolKey, tickLower, this.zeroForOne, this.liquidity);

    model.initialized = true;
    const key = keyOf(tickLower, this.zeroForOne);
    let order = model.active.get(key);
    if (!order) {
      order = { id: model.epochNext++, tickLower, zeroForOne: this.zeroForOne, filled: false, total: 0n, liquidity: [0n, 0n] };
      model.active.set(key, order);
      model.epochs.push(order);
    }
    order.liquidity[this.actor] += this.liquidity;
    order.total += this.liquidity;

    await assertMatches(model, real);
  }

  toString() {
    return `place(owner ${this.actor}, ${this.zeroForOne ? 'above' : 'below'} by ${this.distance}, ${this.liquidity})`;
  }
}

class Swap implements fc.AsyncCommand<Model, Real> {
  constructor(readonly up: boolean, readonly spacings: number) {}

  check() {
    return true;
  }

  async run(model: Model, real: Real) {
    const tick = await currentTick(real);
    const bound = RANGE - SPACING - SPACING / 2;
    // Mid spacing, never on a range boundary, where a filled and an unfilled order would look alike
    const aim = floorToSpacing(tick) + (this.up ? 1 : -1) * this.spacings * SPACING + SPACING / 2;
    const target = Math.max(-bound, Math.min(bound, aim));
    if (target !== tick) {
      const sqrtPrice = await real.tickMath.getSqrtRatioAtTick(target);
      if (target > tick) await real.swapTarget.swapToHigherSqrtPrice(real.pool, sqrtPrice, real.actors[0]);
      else await real.swapTarget.swapToLowerSqrtPrice(real.pool, sqrtPrice, real.actors[0]);
    }
    const after = await currentTick(real);

    if (model.initialized) {
      for (const order of [...model.active.values()]) {
        // Filled once the price has left the whole range on the side the order converts to
        const crossed = order.zeroForOne
          ? after > tick && after >= order.tickLower + SPACING
          : after < tick && after < order.tickLower;
        if (!crossed) continue;

        order.filled = true;
        model.active.delete(keyOf(order.tickLower, order.zeroForOne));
        reached.fills++;

        // The whole range converted, so the epoch holds only the token the order bought
        const info = await real.loModule.epochInfos(order.id);
        const sold = order.zeroForOne ? info.token0Total : info.token1Total;
        const bought = order.zeroForOne ? info.token1Total : info.token0Total;
        expect(sold, `epoch ${order.id} kept the token it sold`).to.equal(0n);
        // An epoch killed down to nothing is still marked filled, with nothing to book
        expect(bought > 0n, `epoch ${order.id} bought something`).to.equal(order.total > 0n);
        order.remaining = [info.token0Total, info.token1Total];
      }
    }

    await assertMatches(model, real);
  }

  toString() {
    return `swap(${this.up ? 'up' : 'down'} ${this.spacings})`;
  }
}

class Kill implements fc.AsyncCommand<Model, Real> {
  constructor(readonly actor: number, readonly pick: number, readonly half: boolean, readonly preferFilled: boolean) {}

  check(model: Readonly<Model>) {
    return model.epochs.some((order) => order.liquidity[this.actor] > 0n);
  }

  async run(model: Model, real: Real) {
    const owned = model.epochs.filter((order) => order.liquidity[this.actor] > 0n);
    const chosen = pickFrom(owned, this.pick, this.preferFilled);
    const stake = chosen.liquidity[this.actor];
    const amount = this.half && stake > 1n ? stake / 2n : stake;
    const owner = real.actors[this.actor];

    // kill finds an order by its ticks, so once filled those ticks lead to whatever was placed there since
    const target = model.active.get(keyOf(chosen.tickLower, chosen.zeroForOne));
    // A thunk, since calling the method sends the kill at once, before the balances ahead of it are read
    const call = () =>
      real.loModule.connect(owner).kill(real.poolKey, chosen.tickLower, chosen.tickLower + SPACING, amount, chosen.zeroForOne, owner);

    if (!target || target.liquidity[this.actor] < amount) {
      await expect(call()).to.be.revertedWithCustomError(real.loModule, 'InsufficientLiquidity');
      if (chosen.filled) reached.killsAfterFill++;
    } else {
      const before = (await real.token0.balanceOf(owner)) + (await real.token1.balanceOf(owner));
      await call();
      const after = (await real.token0.balanceOf(owner)) + (await real.token1.balanceOf(owner));
      expect(after, 'a kill paid nothing back').to.be.greaterThan(before);

      target.liquidity[this.actor] -= amount;
      target.total -= amount;
      reached.kills++;
    }

    await assertMatches(model, real);
  }

  toString() {
    return `kill(owner ${this.actor}, pick ${this.pick}, ${this.half ? 'half' : 'all'}${this.preferFilled ? ', a filled one' : ''})`;
  }
}

class Withdraw implements fc.AsyncCommand<Model, Real> {
  constructor(readonly actor: number, readonly pick: number, readonly preferFilled: boolean) {}

  check(model: Readonly<Model>) {
    return model.epochs.length > 0;
  }

  async run(model: Model, real: Real) {
    const chosen = pickFrom(model.epochs, this.pick, this.preferFilled);
    const owner = real.actors[this.actor];
    const stake = chosen.liquidity[this.actor];
    const call = () => real.loModule.connect(owner).withdraw(chosen.id, owner);

    if (!chosen.filled) {
      await expect(call()).to.be.revertedWithCustomError(real.loModule, 'NotFilled');
      reached.withdrawsBeforeFill++;
    } else if (stake === 0n) {
      await expect(call()).to.be.revertedWithCustomError(real.loModule, 'ZeroLiquidity');
    } else {
      const [held0, held1] = chosen.remaining!;
      // Each owner takes the filled tokens in proportion to the liquidity it placed, rounded down
      const share0 = (held0 * stake) / chosen.total;
      const share1 = (held1 * stake) / chosen.total;

      const before = [await real.token0.balanceOf(owner), await real.token1.balanceOf(owner)];
      await call();
      const after = [await real.token0.balanceOf(owner), await real.token1.balanceOf(owner)];
      expect(after[0] - before[0], 'token0 share').to.equal(share0);
      expect(after[1] - before[1], 'token1 share').to.equal(share1);

      chosen.liquidity[this.actor] = 0n;
      chosen.total -= stake;
      chosen.remaining = [held0 - share0, held1 - share1];
      reached.withdraws++;
    }

    await assertMatches(model, real);
  }

  toString() {
    return `withdraw(owner ${this.actor}, pick ${this.pick}${this.preferFilled ? ', a filled one' : ''})`;
  }
}

describe('LimitOrderManager model', function () {
  this.timeout(20 * 60 * 1000);

  it('should keep every epoch in step with a model across place, swap, kill and withdraw sequences', async function () {
    const owner = fc.integer({ min: 0, max: 1 });
    const commands = fc.commands(
      [
        // Large enough that a stake halved by every command of a sequence still converts to a nonzero amount
        fc
          .tuple(owner, fc.boolean(), fc.integer({ min: 1, max: 4 }), fc.bigInt({ min: 10n ** 8n, max: 10n ** 10n }))
          .map(([actor, zeroForOne, distance, liquidity]) => new Place(actor, zeroForOne, distance, liquidity)),
        fc.tuple(fc.boolean(), fc.integer({ min: 1, max: 6 })).map(([up, spacings]) => new Swap(up, spacings)),
        fc
          .tuple(owner, fc.nat(), fc.boolean(), fc.boolean())
          .map(([actor, pick, half, preferFilled]) => new Kill(actor, pick, half, preferFilled)),
        fc.tuple(owner, fc.nat(), fc.boolean()).map(([actor, pick, preferFilled]) => new Withdraw(actor, pick, preferFilled)),
      ],
      { maxCommands: 16, size: 'max' }
    );

    await fc.assert(
      fc.asyncProperty(commands, async (sequence) => {
        const real = await loadFixture(modelFixture);
        const model: Model = { initialized: false, epochNext: 1n, active: new Map(), epochs: [] };
        await fc.asyncModelRun(() => ({ model, real }), sequence);
      }),
      fuzz
    );

    for (const [path, count] of Object.entries(reached)) {
      expect(count, `${path} reached, of ${JSON.stringify(reached)}`).to.be.greaterThan(0);
    }
  });
});
