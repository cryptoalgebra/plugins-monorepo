import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { MockTimeAlgebraPool } from '@cryptoalgebra/integral-core/typechain';
import { algebraPoolDeployerMockFixture } from 'test-utils/externalFixtures';
import { PLUGIN_FLAGS } from 'test-utils/utilities';
import {
  createPoolFunctions,
  encodePriceSqrt,
  expandTo18Decimals,
  FeeAmount,
  getMaxTick,
  getMinTick,
  TICK_SPACINGS,
} from '@cryptoalgebra/integral-core/test-utils';

import { MockTimeAlgebraUpgradeablePlugin } from '../typechain';
import { ZERO_ADDRESS, deployImplementations, deployPluginFactory, impersonateAlgebraFactory } from './shared/fixtures';

// The plugin returns a fee from beforeSwap unconditionally, and the real pool refuses one unless the
// pool config carries DYNAMIC_FEE. Needs a real pool, MockPool cannot show it.
describe('AlgebraUpgradeablePlugin against a real pool', function () {
  const tickSpacing = TICK_SPACINGS[FeeAmount.MEDIUM];
  const swapAmount = expandTo18Decimals(1) / 10000n;

  async function realPoolFixture() {
    const [wallet] = await ethers.getSigners();

    const fix = await algebraPoolDeployerMockFixture();
    const pool = (await fix.createPool()) as any as MockTimeAlgebraPool;

    const implementations = await deployImplementations();
    const { mockPluginFactory } = await deployPluginFactory(fix.factory, implementations);

    const algebraFactorySigner = await impersonateAlgebraFactory(fix.factory);
    await mockPluginFactory
      .connect(algebraFactorySigner)
      .beforeCreatePoolHook(pool, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, '0x');

    const plugin = (await ethers.getContractFactory('MockTimeAlgebraUpgradeablePlugin')).attach(
      await mockPluginFactory.pluginByPool(pool)
    ) as any as MockTimeAlgebraUpgradeablePlugin;

    await pool.setPlugin(plugin);
    await pool.initialize(encodePriceSqrt(1, 1));

    const { swapExact0For1, mint } = createPoolFunctions({
      swapTarget: fix.swapTargetCallee,
      token0: fix.token0,
      token1: fix.token1,
      pool,
    });

    await mint(wallet.address, getMinTick(tickSpacing), getMaxTick(tickSpacing), expandTo18Decimals(2));

    return { pool, plugin, swapExact0For1, wallet };
  }

  it('is wired with DYNAMIC_FEE and quotes a nonzero fee', async function () {
    const { pool, plugin } = await loadFixture(realPoolFixture);

    // Both halves of the precondition the next two cases rest on
    expect(Number((await pool.globalState()).pluginConfig) & PLUGIN_FLAGS.DYNAMIC_FEE).to.not.equal(0);
    expect(await plugin.getCurrentFee()).to.be.greaterThan(0);
  });

  it('accepts a swap while the pool config carries DYNAMIC_FEE', async function () {
    const { swapExact0For1, wallet } = await loadFixture(realPoolFixture);

    await expect(swapExact0For1(swapAmount, wallet.address)).to.not.be.reverted;
  });

  it('rejects every swap once an administrator clears DYNAMIC_FEE', async function () {
    const { pool, plugin, swapExact0For1, wallet } = await loadFixture(realPoolFixture);

    // Sticks: the plugin only rewrites the config from hooks whose flags it never sets itself
    const withoutDynamicFee = Number(await plugin.defaultPluginConfig()) & ~PLUGIN_FLAGS.DYNAMIC_FEE;
    await pool.setPluginConfig(withoutDynamicFee);

    expect(Number((await pool.globalState()).pluginConfig) & PLUGIN_FLAGS.BEFORE_SWAP_FLAG).to.not.equal(0);

    await expect(swapExact0For1(swapAmount, wallet.address)).to.be.revertedWithCustomError(pool, 'dynamicFeeDisabled');
  });

  it('accepts swaps again once DYNAMIC_FEE is restored', async function () {
    const { pool, plugin, swapExact0For1, wallet } = await loadFixture(realPoolFixture);

    const defaultConfig = Number(await plugin.defaultPluginConfig());
    await pool.setPluginConfig(defaultConfig & ~PLUGIN_FLAGS.DYNAMIC_FEE);
    await expect(swapExact0For1(swapAmount, wallet.address)).to.be.revertedWithCustomError(pool, 'dynamicFeeDisabled');

    await pool.setPluginConfig(defaultConfig);
    await expect(swapExact0For1(swapAmount, wallet.address)).to.not.be.reverted;
  });
});
