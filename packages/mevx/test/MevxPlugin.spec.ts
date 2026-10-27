import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { algebraPoolDeployerMockFixture } from 'test-utils/externalFixtures';
import { deployPinnedProxyDeployer } from 'test-utils/pinnedProxy';
import {
  createPoolFunctions,
  encodePriceSqrt,
  expandTo18Decimals,
  FeeAmount,
  getMaxTick,
  getMinTick,
  TICK_SPACINGS,
} from '@cryptoalgebra/integral-core/test-utils';

// The MEV protection fee travels as amount deltas in 1.3, so only a real pool shows where the tokens go
describe('MevxPlugin MEV protection fee', function () {
  const RATE = 1000n; // 0.1% of the input
  const FEE_DENOMINATOR = 1_000_000n;
  const CONFIG_ID = ethers.id('config');
  const tickSpacing = TICK_SPACINGS[FeeAmount.MEDIUM];
  const amount = expandTo18Decimals(1) / 100n;

  async function deploy(withDistributor: boolean) {
    const [wallet, other] = await ethers.getSigners();
    const fix = await algebraPoolDeployerMockFixture();
    const pool = await fix.createPool();

    const router = await (await ethers.getContractFactory('MockMevxRouter')).deploy();
    const distributor = await (await ethers.getContractFactory('MockProfitDistributor')).deploy();
    const implementation = await (await ethers.getContractFactory('MevxPluginImplementation')).deploy();

    // Pinned bytecode on purpose, see pinnedProxy.ts: a coverage build moves the pool immutable
    const proxyDeployer = await deployPinnedProxyDeployer();
    const Plugin = await ethers.getContractFactory('MevxPluginTest');
    const pluginImplementation = await Plugin.deploy(fix.factory, proxyDeployer, implementation);
    const beacon = await (await ethers.getContractFactory('UpgradeableBeacon')).deploy(pluginImplementation, wallet);

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [
      await router.getAddress(),
      other.address,
      withDistributor ? await distributor.getAddress() : ZeroAddress,
      CONFIG_ID,
    ]);
    await proxyDeployer.deploy(beacon, pool, initData);
    const plugin = Plugin.attach(await proxyDeployer.lastDeployedProxy()) as any;

    await pool.setPlugin(plugin);
    await pool.initialize(encodePriceSqrt(1, 1));

    await plugin.setMevProtectionFeeEnabled(true);
    await router.setMevProtectionFee(RATE);

    const poolFunctions = createPoolFunctions({ swapTarget: fix.swapTargetCallee, token0: fix.token0, token1: fix.token1, pool });
    await poolFunctions.mint(wallet.address, getMinTick(tickSpacing), getMaxTick(tickSpacing), expandTo18Decimals(10));

    return { wallet, other, pool, plugin, router, distributor, ...fix, ...poolFunctions };
  }

  const withDistributorFixture = () => deploy(true);
  const withoutDistributorFixture = () => deploy(false);

  async function swapEvents(pool: any, tx: any) {
    const receipt = await (await tx).wait();
    const parsed = receipt.logs.map((log: any) => pool.interface.parseLog(log)).filter(Boolean);
    return {
      swap: parsed.find((e: any) => e.name === 'Swap')!.args,
      swapFee: parsed.find((e: any) => e.name === 'SwapFee')!.args,
    };
  }

  it('is wired with the amount delta hooks', async function () {
    const { pool } = await loadFixture(withDistributorFixture);
    // AFTER_SWAP_CALCULATION_FLAG = 1 << 9, AMOUNT_DELTAS_FLAG = 1 << 10
    const config = BigInt((await pool.globalState()).pluginConfig);
    expect(config & (1n << 9n)).to.not.equal(0n);
    expect(config & (1n << 10n)).to.not.equal(0n);
  });

  it('takes the fee of an exactIn swap from its input and distributes it', async function () {
    const { pool, plugin, distributor, token0, wallet, swapExact0For1 } = await loadFixture(withDistributorFixture);

    const tx = swapExact0For1(amount, wallet.address);
    await expect(tx).to.emit(distributor, 'ProfitDistributed').withArgs(CONFIG_ID, await token0.getAddress(), ZeroAddress);
    const { swap, swapFee } = await swapEvents(pool, tx);

    const fee = (amount * RATE) / FEE_DENOMINATOR;
    expect(swapFee.pluginAmountIn).to.equal(fee);
    // The user pays the amount asked, the fee comes out of it
    expect(swap.amount0).to.equal(amount);
    expect(await token0.balanceOf(distributor)).to.equal(fee);
    expect(await token0.balanceOf(plugin)).to.equal(0);
  });

  it('takes the fee of an exactOut swap on top of its input and distributes it', async function () {
    const { pool, plugin, distributor, token0, wallet, swap0ForExact1 } = await loadFixture(withDistributorFixture);

    const { swap, swapFee } = await swapEvents(pool, swap0ForExact1(amount, wallet.address));

    const fee: bigint = swapFee.pluginAmountIn;
    const paid: bigint = swap.amount0;
    expect(fee).to.be.greaterThan(0);
    // The fee is a share of the calculated input, which the user pays on top
    expect(fee).to.equal(((paid - fee) * RATE) / FEE_DENOMINATOR);
    expect(-swap.amount1).to.equal(amount);
    expect(await token0.balanceOf(distributor)).to.equal(fee);
    expect(await token0.balanceOf(plugin)).to.equal(0);
  });

  it('charges the input token of a oneToZero swap', async function () {
    const { pool, distributor, token0, token1, wallet, swapExact1For0 } = await loadFixture(withDistributorFixture);

    const { swapFee } = await swapEvents(pool, swapExact1For0(amount, wallet.address));

    expect(swapFee.pluginAmountIn).to.equal((amount * RATE) / FEE_DENOMINATOR);
    expect(await token1.balanceOf(distributor)).to.equal(swapFee.pluginAmountIn);
    expect(await token0.balanceOf(distributor)).to.equal(0);
  });

  it('charges each swap of a sequence alone', async function () {
    const { pool, distributor, token0, wallet, swap0ForExact1, swapExact0For1 } = await loadFixture(withDistributorFixture);

    const exactOut = await swapEvents(pool, swap0ForExact1(amount, wallet.address));
    const exactIn = await swapEvents(pool, swapExact0For1(amount, wallet.address));

    expect(exactIn.swapFee.pluginAmountIn).to.equal((amount * RATE) / FEE_DENOMINATOR);
    expect(await token0.balanceOf(distributor)).to.equal(exactOut.swapFee.pluginAmountIn + exactIn.swapFee.pluginAmountIn);
  });

  it('charges nothing while the fee is switched off', async function () {
    const { pool, plugin, distributor, token0, wallet, swapExact0For1, swap0ForExact1 } = await loadFixture(withDistributorFixture);
    await plugin.setMevProtectionFeeEnabled(false);

    expect((await swapEvents(pool, swapExact0For1(amount, wallet.address))).swapFee.pluginAmountIn).to.equal(0);
    expect((await swapEvents(pool, swap0ForExact1(amount, wallet.address))).swapFee.pluginAmountIn).to.equal(0);
    expect(await token0.balanceOf(distributor)).to.equal(0);
  });

  it('charges the executor nothing', async function () {
    const { pool, plugin, distributor, token0, wallet, swapTargetCallee, swapExact0For1 } = await loadFixture(withDistributorFixture);
    // The callee is what calls the pool, so it is the sender the hooks see
    await plugin.setMevxExecutor(swapTargetCallee);

    expect((await swapEvents(pool, swapExact0For1(amount, wallet.address))).swapFee.pluginAmountIn).to.equal(0);
    expect(await token0.balanceOf(distributor)).to.equal(0);
  });

  it('keeps the fee on the plugin without a distributor, for collectPluginFee', async function () {
    const { pool, plugin, token0, wallet, other, swapExact0For1 } = await loadFixture(withoutDistributorFixture);

    const { swapFee } = await swapEvents(pool, swapExact0For1(amount, wallet.address));
    expect(await token0.balanceOf(plugin)).to.equal(swapFee.pluginAmountIn);

    await plugin.collectPluginFee(token0, swapFee.pluginAmountIn, other.address);
    expect(await token0.balanceOf(other.address)).to.equal(swapFee.pluginAmountIn);
  });

  it('quotes the pool fee, the MEV protection fee is not a part of it', async function () {
    const { pool, wallet, swapExact0For1 } = await loadFixture(withDistributorFixture);

    const quoted = await pool.getSwapFee(wallet.address, wallet.address, true, amount, 0, false, '0x');
    const { swapFee } = await swapEvents(pool, swapExact0For1(amount, wallet.address));
    expect(swapFee.fee).to.equal(quoted);
    expect(quoted).to.equal((await pool.globalState()).lastFee);
  });
});
