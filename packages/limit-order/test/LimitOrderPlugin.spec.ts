import { Wallet, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'test-utils/expect';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ZERO_ADDRESS, limitOrderPluginFixture } from './limitOrderFixture';
import { encodePriceSqrt, MAX_SQRT_RATIO, MIN_SQRT_RATIO} from 'test-utils/utilities';

import { LimitOrderManager, TestERC20, IWNativeToken, LimitOrderTestPlugin } from '../typechain';

import snapshotGasCost from 'test-utils/snapshotGasCost';
import { AlgebraPool, TestAlgebraCallee } from '@cryptoalgebra/integral-core/typechain';

describe('LimitOrders', () => {
  let wallet: Wallet, other: Wallet;

  let loModule: LimitOrderManager
  let pool: AlgebraPool; 
  let pool0Wnative: AlgebraPool;
  let poolWnative1: AlgebraPool;
  let token0: TestERC20;
  let token1: TestERC20;
  let wnative: IWNativeToken;
  let swapTarget: TestAlgebraCallee;
  let poolKey: {token0: string, token1: string, deployer: string};
  let poolKeyWnative: {token0: string, token1: string, deployer: string};
 

  async function initializeAtZeroTick(_pool: AlgebraPool) {
    await _pool.initialize(encodePriceSqrt(1, 1));
  }

  before('prepare signers', async () => {
    [wallet, other] = await (ethers as any).getSigners();
  });

  beforeEach('deploy test limitOrderPlugin', async () => {
    ({ loModule, token0, token1, wnative, pool, pool0Wnative, poolWnative1, swapTarget } = await loadFixture(limitOrderPluginFixture));

    poolKey = {token0: await token0.getAddress(), token1: await token1.getAddress(), deployer: ZeroAddress}
    poolKeyWnative = {token0: await token0.getAddress(), token1: await wnative.getAddress(), deployer: ZeroAddress}
    
    await initializeAtZeroTick(pool);
    await initializeAtZeroTick(pool0Wnative);

    await token0.approve(loModule, 2n**255n);
    await token1.approve(loModule, 2n**255n);
    await wnative.approve(loModule, 2n**255n);

    await token0.approve(swapTarget, 2n**255n);
    await token1.approve(swapTarget, 2n**255n);
    await wnative.approve(swapTarget, 2n**255n);


    await token0.connect(other).approve(loModule, 2n**255n);
    await token1.connect(other).approve(loModule, 2n**255n);

    await token0.transfer(other, 10n**10n)
    await token1.transfer(other, 10n**10n)

    await swapTarget.mint(pool, wallet, -600, 600, 10n**8n)
    await swapTarget.mint(pool, wallet, -300, 300, 10n**8n)
    
  });

  it('initialize on place works correct', async () => {
      
    await initializeAtZeroTick(poolWnative1)

    await wnative.deposit({value:10n**8n});

    await swapTarget.mint(pool, poolWnative1, -600, 600, 10n**8n)
    await swapTarget.swapToLowerSqrtPrice(poolWnative1, encodePriceSqrt(1,2), wallet);

    const pluginContractFacroty = await ethers.getContractFactory('LimitOrderTestPlugin');
    let pluginAddress = await poolWnative1.plugin();
    let plugin = (pluginContractFacroty.attach(pluginAddress)) as any as LimitOrderTestPlugin;

    await plugin.setLimitOrderManager(loModule);
    expect(await loModule.initialized(poolWnative1)).to.be.eq(false);
    await loModule.place({token0: await wnative.getAddress(), token1: await token1.getAddress(), deployer: ZeroAddress}, -60, true, 10n**8n);

    expect(await loModule.initialized(poolWnative1)).to.be.eq(true);
    expect(await loModule.tickLowerLasts(poolWnative1)).to.be.eq(-6960)
  })

  describe('#place', async () => {

    describe('works correct', async () => {

      it('place lo at negative tick', async () => {
          await loModule.place(poolKey, -60, false, 10n**8n);

          const {filled, tickLower, tickUpper, liquidityTotal, token0 : token0address,  token1 : token1address, token0Total, token1Total} = await loModule.epochInfos(1);

          expect(filled).to.be.eq(false);
          expect(tickLower).to.be.eq(-60);
          expect(tickUpper).to.be.eq(0);
          expect(liquidityTotal).to.be.eq(10n**8n);
          expect(token0address).to.be.eq(await token0.getAddress());
          expect(token1address).to.be.eq(await token1.getAddress());
          expect(token0Total).to.be.eq(1);
          expect(token1Total).to.be.eq(0);

          expect( await loModule.getEpochLiquidity(1, wallet)).to.be.eq(10n**8n);

          await loModule.place(poolKey, 0, true, 10n**8n);
      });

      it('place lo at positive tick', async () => {
        await loModule.place(poolKey, 60, true, 10n**8n);

        const {tickLower, tickUpper, liquidityTotal} = await loModule.epochInfos(1);

        expect(tickLower).to.be.eq(60);
        expect(tickUpper).to.be.eq(120);
        expect(liquidityTotal).to.be.eq(10n**8n);
      });

      it('place lo at min tick', async () => {
        await loModule.place(poolKey, -887220, false, 10n**8n);

        const {tickLower, tickUpper, liquidityTotal} = await loModule.epochInfos(1);

        expect(tickLower).to.be.eq(-887220);
        expect(tickUpper).to.be.eq(-887160);
        expect(liquidityTotal).to.be.eq(10n**8n);
      });

      it('place lo at tick with closed lo', async () => {
        await loModule.place(poolKey, 60, true, 10n**8n);
        await swapTarget.swapToHigherSqrtPrice(pool, encodePriceSqrt(102,100), wallet);
        await loModule.place(poolKey, 60, false, 10n**8n);
        const {filled, tickLower, tickUpper, liquidityTotal} = await loModule.epochInfos(2);

        expect(tickLower).to.be.eq(60);
        expect(tickUpper).to.be.eq(120);
        expect(liquidityTotal).to.be.eq(10n**8n);
        expect(filled).to.be.eq(false);
      });

      it('create new lo at same tick', async () => {
        await loModule.place(poolKey, -60, false, 10n**8n);
        await loModule.connect(other).place(poolKey, -60, false, 10n**8n);

        const {tickLower, tickUpper, liquidityTotal} = await loModule.epochInfos(1);

        expect(tickLower).to.be.eq(-60);
        expect(tickUpper).to.be.eq(0);
        expect(liquidityTotal).to.be.eq(2n * 10n**8n);

        expect( await loModule.getEpochLiquidity(1, wallet)).to.be.eq(10n**8n);
        expect( await loModule.getEpochLiquidity(1, other)).to.be.eq(10n**8n);
      });

      it('place lo with wnative', async () => {
        await loModule.place(poolKeyWnative, -60, false, 10n**8n, {value: 299536});

        const {tickLower, tickUpper, liquidityTotal} = await loModule.epochInfos(1);

        expect(tickLower).to.be.eq(-60);
        expect(tickUpper).to.be.eq(0);
        expect(liquidityTotal).to.be.eq(10n**8n);
        expect(await wnative.balanceOf(pool0Wnative)).to.be.eq(299536)
      });

      it('gas [ @skip-on-coverage ]', async () => {
        await snapshotGasCost(loModule.place(poolKey, -60, false, 10n**8n));
      });

      it('gas second place at same tick [ @skip-on-coverage ]', async () => {
        await loModule.place(poolKey, -60, false, 10n**8n);
        await snapshotGasCost(loModule.place(poolKey, -60, false, 10n**8n));
      });

    });

    describe('reverts if', async () => {

      it('pass incorrect zeroToOne ', async () => {
        await expect(loModule.place(poolKey, -60, true, 10n**8n)).to.be.revertedWithCustomError(loModule,"CrossedRange()");
        await expect(loModule.place(poolKey, 60, false, 10n**8n)).to.be.revertedWithCustomError(loModule,"CrossedRange()");
      });

      it('try to place active pos', async () => {
        await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(999,1000), wallet);
        await expect(loModule.place(poolKey, -60, false, 10n**8n)).to.be.revertedWithCustomError(loModule,"InRange()");
      });
      
      it('try to place 0 liquidity lo', async () => {
        await expect(loModule.place(poolKey, -60, false, 0)).to.be.revertedWithCustomError(loModule,"ZeroLiquidity()");
      });

      it('try to place lo at max tick', async () => {
        await expect(loModule.place(poolKey, 887220, true, 10n**8n)).to.be.reverted;
      });
    });

  });

  describe('#after swap', async () => {

    it('cross & close lo zeroToOne false', async () => {
        await loModule.place(poolKey, -60, false, 10n**8n);
        await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(98,100), wallet);

        const {filled, liquidityTotal, token0Total, token1Total} = await loModule.epochInfos(1);

        expect(filled).to.be.eq(true);
        expect(liquidityTotal).to.be.eq(10n**8n);
        expect(token0Total).to.be.eq(300435);
        expect(token1Total).to.be.eq(0);

        expect(await loModule.getEpochLiquidity(1,wallet)).to.be.eq(10n**8n);
    });

    it('cross & close lo zeroToOne true', async () => {
      await loModule.place(poolKey, 0, true, 10n**8n);
      await swapTarget.swapToHigherSqrtPrice(pool, encodePriceSqrt(102,100), wallet);

      const {filled, liquidityTotal, token0Total, token1Total} = await loModule.epochInfos(1);

      expect(filled).to.be.eq(true);
      expect(liquidityTotal).to.be.eq(10n**8n);
      expect(token0Total).to.be.eq(0);
      expect(token1Total).to.be.eq(300435);

      expect(await loModule.getEpochLiquidity(1,wallet)).to.be.eq(10n**8n);
    });

    it('close lo at ~min tick', async () => {
      await pool.setTickSpacing(200)
      await loModule.place(poolKey, -887200, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, MIN_SQRT_RATIO + 1n, wallet);

      const {filled, liquidityTotal, token0Total, token1Total} = await loModule.epochInfos(1);

      expect(filled).to.be.eq(true);
      expect(liquidityTotal).to.be.eq(10n**8n);
      expect(token0Total).to.be.eq(18287264462421443532704155n);
      expect(token1Total).to.be.eq(0);
    });

    it('close lo at ~max tick', async () => {
      await pool.setTickSpacing(200)
      await loModule.place(poolKey, 887000, true, 10n**8n);
      await swapTarget.swapToHigherSqrtPrice(pool, MAX_SQRT_RATIO - 1n, wallet);

      const {filled, liquidityTotal, token0Total, token1Total} = await loModule.epochInfos(1);

      expect(filled).to.be.eq(true);
      expect(liquidityTotal).to.be.eq(10n**8n);
      expect(token0Total).to.be.eq(0);
      expect(token1Total).to.be.eq(18287264566953458853389250n);
    });

    it('close lo with several swaps', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(9995,10000), wallet);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(9985,10000), wallet);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(9950,10000), wallet);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(9900,10000), wallet);

      const {filled, liquidityTotal, token0Total, token1Total} = await loModule.epochInfos(1);

      expect(filled).to.be.eq(true);
      expect(liquidityTotal).to.be.eq(10n**8n);
      expect(token0Total).to.be.eq(300435);
      expect(token1Total).to.be.eq(0);
    })

    it('cross several los', async () => {
      
      for (let i = 0; i < 20; i++) {
        await loModule.place(poolKey, i*60, true, 10n**8n);
      }
      await swapTarget.swapToHigherSqrtPrice(pool, encodePriceSqrt(2,1), wallet);

      for (let i = 1; i < 21; i++) {
        const {filled, liquidityTotal, token0Total, } = await loModule.epochInfos(i);
        expect(filled).to.be.eq(true);
        expect(liquidityTotal).to.be.eq(10n**8n);
        expect(token0Total).to.be.eq(0);

        expect(await loModule.getEpochLiquidity(1,wallet)).to.be.eq(10n**8n);
      }
    });

    it('cross ticks without lo', async () => {
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(98,100), wallet);

      expect(await loModule.tickLowerLasts(pool)).to.be.eq(-240)
    });

    it('reverts if msg sender is not plugin', async () => {

      await expect(loModule.afterSwap(ZERO_ADDRESS, false, 0)).to.be.revertedWithCustomError(loModule, "NotPlugin()")
      await expect(loModule.afterInitialize(ZERO_ADDRESS, 0)).to.be.revertedWithCustomError(loModule, "NotPlugin()")
    });

  })

  describe('#withdraw', async () => {

    it('withdraw filled lo', async () => {
        await loModule.place(poolKey, -60, false, 10n**8n);
        await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(99,100), wallet);

        let balanceBefore = await token0.balanceOf(wallet);
        await loModule.withdraw(1, wallet);
        let balanceAfter =  await token0.balanceOf(wallet);
        expect(balanceAfter - balanceBefore).to.be.eq(300435)
    });

    it('withdraw filled lo from tick with other los', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await loModule.connect(other).place(poolKey, -60, false, 10n**8n);
      await loModule.connect(other).place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(99,100), wallet);

      let balanceBefore = await token0.balanceOf(wallet);
      await loModule.withdraw(1, wallet);
      let balanceAfter =  await token0.balanceOf(wallet);

      const {filled, liquidityTotal} = await loModule.epochInfos(1);
      expect(filled).to.be.eq(true)
      expect(liquidityTotal).to.be.eq(10n ** 8n * 2n)
      expect(balanceAfter - balanceBefore).to.be.eq(300435)
  });

    it('distribution is correct', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await loModule.connect(other).place(poolKey, -60, false, 10n**8n);

      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(99,100), wallet);

      let balanceBefore = await token0.balanceOf(other);
      await loModule.withdraw(1, other);
      let balanceAfter =  await token0.balanceOf(other);
      expect(balanceAfter - balanceBefore).to.be.eq(300435)
      const {liquidityTotal} = await loModule.epochInfos(1)
      expect(liquidityTotal).to.be.eq(10n ** 8n)
    });

    it('withdraw filled lo wnative', async () => {
      await loModule.place(poolKeyWnative, 60, true, 10n**8n);

      await wnative.deposit({value: 400000});
      await wnative.approve(swapTarget, 400000)

      await swapTarget.swapToHigherSqrtPrice(pool0Wnative, encodePriceSqrt(102,100), wallet);

      let {amount0, amount1} = await loModule.withdraw.staticCall(1, wallet);
      expect(amount0).to.be.eq(0);
      expect(amount1).to.be.eq(301338);
  });

    it('reverts if claim not filled lo', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);

      await expect(loModule.withdraw(1, other)).to.be.revertedWithCustomError(loModule,"NotFilled()")
    });

    it('reverts if withdraw other users limit order', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(99,100), wallet);

      await expect(loModule.connect(other).withdraw(1, other)).to.be.revertedWithCustomError(loModule,"ZeroLiquidity()")
    });
  })

  describe('#setTickSpacing', () => { 
    
    it('works correct', async () => {
      await loModule.setTickSpacing(pool, 120)

      expect(await loModule.tickSpacings(pool)).to.be.eq(120)
    });

    it('withdraw works correct after tickSpacing change', async () => {
      await loModule.setTickSpacing(pool, 120)

      await loModule.place(poolKey, -120, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(98,100), wallet);

      let balanceBefore = await token0.balanceOf(wallet);
      await loModule.withdraw(1, wallet);
      let balanceAfter =  await token0.balanceOf(wallet);
      expect(balanceAfter - balanceBefore).to.be.eq(601773)
    });

    it('kill works correct after tickSpacing ', async () => {
      await loModule.setTickSpacing(pool, 120)

      await loModule.place(poolKey, -120, false, 10n**8n);

      let balanceBefore = await token1.balanceOf(wallet);
      await loModule.kill(poolKey, -120, 0, 10n**8n, false, wallet);
      let balanceAfter =  await token1.balanceOf(wallet);
      expect(balanceAfter - balanceBefore).to.be.eq(598173)
    });

    it('reverts if caller is not plugin manager', async () => {
      await expect(loModule.connect(other).setTickSpacing(pool, 120)).to.be.reverted
    });

  })

  describe('#kill', async () => {

    it('works correct', async () => {
        await loModule.place(poolKey, -60, false, 10n**8n);

        let balanceBefore = await token1.balanceOf(other);
        await loModule.kill(poolKey, -60, 0, 10n ** 8n, false, other);
        let balanceAfter =  await token1.balanceOf(other);
        await expect(balanceAfter - balanceBefore).to.be.eq(299535)
    });

    it('works correct wnative', async () => {
      await loModule.place(poolKeyWnative, -60, false, 10n**8n, {value: 299536});

      let {amount0, amount1} = await loModule.kill.staticCall(poolKeyWnative, -60, 0, 10n**8n, false, wallet);
      expect(amount0).to.be.eq(0);
      expect(amount1).to.be.eq(299535);
    });

    it('works correct for partial filled lo', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(995,1000), wallet);

      let balanceBefore1 = await token1.balanceOf(other);
      let balanceBefore0 = await token0.balanceOf(other);
      await loModule.kill(poolKey, -60, 0, 10n ** 8n, false, other);
      let balanceAfter1 =  await token1.balanceOf(other);
      let balanceAfter0 =  await token0.balanceOf(other);
      await expect(balanceAfter1 - balanceBefore1).to.be.eq(49222)   
      await expect(balanceAfter0 - balanceBefore0).to.be.eq(250941)   
    });

    it('works correct for partial filled lo on tick with few los', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await loModule.connect(other).place(poolKey, -60, false, 10n**8n);
      await loModule.connect(other).place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(995,1000), wallet);

      let balanceBefore1 = await token1.balanceOf(other);
      let balanceBefore0 = await token0.balanceOf(other);
      await loModule.kill(poolKey, -60, 0, 10n ** 8n, false, other);
      let balanceAfter1 =  await token1.balanceOf(other);
      let balanceAfter0 =  await token0.balanceOf(other);

      const {filled, liquidityTotal} = await loModule.epochInfos(1);
      await expect(filled).to.be.eq(false);
      await expect(liquidityTotal).to.be.eq(10n**8n * 2n);
      await expect(balanceAfter1 - balanceBefore1).to.be.eq(49222)   
      await expect(balanceAfter0 - balanceBefore0).to.be.eq(250941)   
    });

    it('reverts if kill filled lo', async () => {
      await loModule.place(poolKey, -600, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(50,100), wallet);

      await expect(loModule.kill(poolKey, -600, -540, 10n ** 8n, false, wallet)).to.be.revertedWithCustomError(loModule,"InsufficientLiquidity()")  
      await loModule.place(poolKey, -600, true, 10n**8n);   
      await loModule.kill(poolKey, -600, -540, 10n ** 8n, true, wallet) 
    });

    it('reverts if kill 0 liquidity', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);
      await swapTarget.swapToLowerSqrtPrice(pool, encodePriceSqrt(98,100), wallet);


      await expect(loModule.kill(poolKey, -60, 0, 0, false, wallet)).to.be.revertedWithCustomError(loModule,"ZeroLiquidity()")      
    });

    it('partial kill', async () => {
      await loModule.place(poolKey, -60, false, 10n**8n);

      let balanceBefore = await token1.balanceOf(other);
      await loModule.kill(poolKey, -60, 0, (10n ** 8n)/2n, false, other);
      const {filled, liquidityTotal} = await loModule.epochInfos(1);
      let balanceAfter =  await token1.balanceOf(other);
      await expect(balanceAfter - balanceBefore).to.be.eq(149767)   
      await expect(filled).to.be.eq(false)
      await expect(liquidityTotal).to.be.eq((10n ** 8n)/2n)
    });

  })

});
