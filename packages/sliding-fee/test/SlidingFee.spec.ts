import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { pinnedProxyDeployerFactory } from 'test-utils/pinnedProxy';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import snapshotGasCost from 'test-utils/snapshotGasCost';

describe('SlidingFee', () => {
  let slidingFeePlugin: any;

  async function slidingFeeFixture() {
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    const SlidingFeePluginImplementation = await ethers.getContractFactory('SlidingFeePluginImplementation');
    const slidingFeeImpl = await SlidingFeePluginImplementation.deploy();

    const BeaconProxyDeployer = await pinnedProxyDeployerFactory();
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    const UpgradeableSlidingFeePluginTest = await ethers.getContractFactory('UpgradeableSlidingFeePluginTest');
    const pluginImplementation = await UpgradeableSlidingFeePluginTest.deploy(
      mockFactory.target,
      proxyDeployer.target,
      slidingFeeImpl.target
    );

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', [mockPool.target, 100]);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const proxyAddress = await proxyDeployer.lastDeployedProxy();

    return UpgradeableSlidingFeePluginTest.attach(proxyAddress) as any;
  }

  beforeEach('deploy SlidingFeeTest', async () => {
    slidingFeePlugin = await loadFixture(slidingFeeFixture);
  });

  it('set config', async () => {
    await slidingFeePlugin.setBaseFee(500)
    await slidingFeePlugin.setPriceChangeFactor(1000)

    expect(await slidingFeePlugin.baseFee()).to.be.eq(500)
    expect(await slidingFeePlugin.priceChangeFactor()).to.be.eq(1000)
  });

  describe('#FeeFactors', () => {
    beforeEach('set config', async () => {
      await slidingFeePlugin.setBaseFee(500)
      await slidingFeePlugin.setPriceChangeFactor(1000)
    });

    for (const factor of [500, 1000, 2000]) {
      it("Shifts correct with positive price change, factor is " + factor, async function () {

          await slidingFeePlugin.setPriceChangeFactor(factor) 
          // swap, price increased x2 (otz)
          let lastTick = 10000
          let currentTick  = 16932

          await slidingFeePlugin.getFeeForSwap(false, lastTick, currentTick);

          if (factor == 500) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.approximately((3n << 96n) / 2n, 1n << 81n); // 1.5
            expect(zeroToOneFeeFactor).to.be.approximately(1n << 95n, 1n << 81n); // 0.5
          }

          if (factor == 1000) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.approximately(2n << 96n, 1n << 81n); // 2
            expect(zeroToOneFeeFactor).to.be.approximately(0n << 96n, 1n << 81n); // 0
          }

          if (factor == 2000) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.eq(2n << 96n); // 2
            expect(zeroToOneFeeFactor).to.be.eq(0n << 96n); // 0
          }
      });

      it("Shifts correct with negative price change, factor is " + factor, async function () {
          await slidingFeePlugin.setPriceChangeFactor(factor)

          // swap, price decreased x0.25 (zto)
          let lastTick = 16932  
          let currentTick  = 10000 

          await slidingFeePlugin.getFeeForSwap(false, lastTick, currentTick);
        
          if (factor == 500) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.approximately((3n << 96n )/ 4n, 1n << 81n); // 0.75
            expect(zeroToOneFeeFactor).to.be.approximately((5n << 96n) / 4n, 1n << 81n); // 1.25
          }

          if (factor == 1000) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.approximately(1n << 95n, 1n << 81n); // 0
            expect(zeroToOneFeeFactor).to.be.approximately((3n << 96n) / 2n, 1n << 81n); // 2
          }

          if (factor == 2000) {
            const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
            expect(oneToZeroFeeFactor).to.be.eq(0n << 96n); // 0
            expect(zeroToOneFeeFactor).to.be.eq(2n << 96n); // 2
          }
      });
    }

    

    it("Factors should be reset", async function () {

      // swap, price increased x1.5 (otz)
      let lastTick = 10000
      let currentTick =  14055
      await slidingFeePlugin.getFeeForSwap(false, lastTick, currentTick); // 1.5, 0.5

      // swap, price decreased x0.5 (zto)
      lastTick = 14055
      currentTick = 7123
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick); // 1, 1

      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.approximately(1n << 96n, 1n << 81n); // 1
      expect(zeroToOneFeeFactor).to.be.approximately(1n << 96n, 1n << 81n); // 1
    });

    it("Huge swap otz", async function () {

      // swap, price changed from min to max
      let lastTick = -887272
      let currentTick = 887272

      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.eq(2n << 96n); // 2
      expect(zeroToOneFeeFactor).to.be.eq(0n << 96n); // 0
    });

    it("Huge swap zto", async function () {

      // swap, price changed from min to max
      let lastTick = 887272
      let currentTick = -887272

      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.eq(0n << 96n); // 0
      expect(zeroToOneFeeFactor).to.be.eq(2n << 96n); // 2
    });

    it("Shift correct after two oneToZero movements", async function () {
      await slidingFeePlugin.setPriceChangeFactor(500)
      // swap, price increased x2 (otz)
      let lastTick = 10000
      let currentTick  = 16932
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      // swap, price increased x1.5 (otz)
      lastTick = 16932
      currentTick  = 20987
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.approximately((7n << 96n) / 4n, 1n << 81n); // 1.75
      expect(zeroToOneFeeFactor).to.be.approximately((1n << 96n) / 4n, 1n << 81n); // 0.25
    });

    it("Shift correct after two zeroToOne movements", async function () {
      await slidingFeePlugin.setPriceChangeFactor(500)
      // swap, price decreased x0.5 (zt0)
      let lastTick = 20987
      let currentTick  = 14055
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);


      // swap, price decreased x0.5 (zt0)
      lastTick = 14055
      currentTick  = 7123
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.approximately(1n << 95n , 1n << 81n); // 0.5
      expect(zeroToOneFeeFactor).to.be.approximately((3n << 96n) / 2n, 1n << 81n); // 1.5
    });
    
    it("Shift correct after two oneToZero movements(negative ticks)", async function () {
      await slidingFeePlugin.setPriceChangeFactor(500)
      // swap, price increased x2 (otz)
      let lastTick = -20987
      let currentTick  = -14055
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);


     // swap, price increased x1.5(otz)
      lastTick = -14055
      currentTick  = -10000
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);
      
      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.approximately((7n << 96n) / 4n, 1n << 81n); // 1.75
      expect(zeroToOneFeeFactor).to.be.approximately((1n << 96n) / 4n, 1n << 81n); // 0.25

    });

    it("Shift correct after two zeroToOne movements(negative ticks)", async function () {
      await slidingFeePlugin.setPriceChangeFactor(500)
      // swap, price decreased x0.5 (zto)
      let lastTick = -10000
      let currentTick  = -16932
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);

      // swap, price decreased x0.5 (zto)
      lastTick = -16932
      currentTick  = -23864
      await slidingFeePlugin.getFeeForSwap(true, lastTick, currentTick);
      
      const [zeroToOneFeeFactor, oneToZeroFeeFactor] = await slidingFeePlugin.feeFactors();
      expect(oneToZeroFeeFactor).to.be.approximately(1n << 95n, 1n << 81n); // 0.5
      expect(zeroToOneFeeFactor).to.be.approximately((3n << 96n) / 2n, 1n << 81n); // 1.5
    });

  });

  describe('#getSlidingFee', () => {

    async function getFee(zto: boolean, lastTick: number, currentTick: number) : Promise<number>{
      await slidingFeePlugin.getFeeForSwap(zto, lastTick, currentTick);
      return Number(await slidingFeePlugin.lastFee());
    }
    
    beforeEach('set config', async () => {
      await slidingFeePlugin.setBaseFee(500)
      await slidingFeePlugin.setPriceChangeFactor(1000)
    });

    it("returns base fee value", async function () {
      let fee = await getFee(false, 10000, 10000)
      expect(fee).to.be.eq(500)
    });

    it("one to zero fee should be increased x1.5", async function () {
      let feeOtZ = await getFee(false, 10000, 14055)
      expect(feeOtZ).to.be.eq(750)
    });

    it("zero to one fee should be decreased x1.5", async function () {
      let feeZtO = await getFee(true, 10000, 14054)
      expect(feeZtO).to.be.eq(250)
    });

    it("handle overflow", async function () {
      await slidingFeePlugin.setBaseFee(50000)
      let feeOtZ = await getFee(false, 10000,100000)
      expect(feeOtZ).to.be.eq(65535)
    });

    it("MIN fee is 1 (0.0001%)", async function () {
      await slidingFeePlugin.setBaseFee(50000)
      let feeOtZ = await getFee(true, 10000,100000)
      expect(feeOtZ).to.be.eq(1)
    });

  })


  describe('#getFee gas cost  [ @skip-on-coverage ]', () => {
    it('gas cost of same tick', async () => {
      await snapshotGasCost(slidingFeePlugin.getFeeForSwap(true, 100, 100));
    });

    it('gas cost of tick increase', async () => {
      await snapshotGasCost(slidingFeePlugin.getFeeForSwap(true, 10000, 40000));
    });

    it('gas cost of tick decrease', async () => {
      await snapshotGasCost(slidingFeePlugin.getFeeForSwap(false, 40000, 10000));
    });
  });


  // _getCurrentFee has no caller on this branch, sliding-fee is composed only by the harness here.
  // Its two clamps are shipped logic all the same, and neither had ever been evaluated.
  describe('#getCurrentFee', () => {
    beforeEach('set config', async () => {
      await slidingFeePlugin.setBaseFee(500)
      await slidingFeePlugin.setPriceChangeFactor(1000)
    });

    it('returns baseFee while both factors are still one', async function () {
      expect(await slidingFeePlugin.getCurrentFeeForDirection(true)).to.be.eq(500)
      expect(await slidingFeePlugin.getCurrentFeeForDirection(false)).to.be.eq(500)
    });

    it('clamps at uint16 max and floors at one, in the two directions at once', async function () {
      // Price doubled one to zero, which drives that factor to ~2 and the opposite one to ~0
      await slidingFeePlugin.getFeeForSwap(false, 10000, 16932);
      await slidingFeePlugin.setBaseFee(40000);

      // 40000 * 2 does not fit in uint16
      expect(await slidingFeePlugin.getCurrentFeeForDirection(false)).to.be.eq(65535)
      // 40000 * ~0 truncates to nothing, and the fee is never allowed to be zero
      expect(await slidingFeePlugin.getCurrentFeeForDirection(true)).to.be.eq(1)
    });
  });

  // The connector reads baseFee, priceChangeFactor and feeFactors straight off storage instead of
  // delegating, so the implementation keeps a second copy that no plugin reaches and that can drift.
  describe('#implementation kept in step with the connector', () => {
    it('should report the same configuration as the connector', async function () {
      await slidingFeePlugin.setBaseFee(700)
      await slidingFeePlugin.setPriceChangeFactor(1500)

      // Configure a bare implementation in its own storage, then compare the two copies
      const impl = await (await ethers.getContractFactory('SlidingFeePluginImplementation')).deploy();
      await impl.initializeSlidingFee(700);
      await impl.setPriceChangeFactor(1500);

      expect(await impl.getBaseFee()).to.be.eq(await slidingFeePlugin.baseFee())
      expect(await impl.getPriceChangeFactor()).to.be.eq(await slidingFeePlugin.priceChangeFactor())

      const [implZeroToOne, implOneToZero] = await impl.getFeeFactors();
      const [zeroToOne, oneToZero] = await slidingFeePlugin.feeFactors();
      expect(implZeroToOne).to.be.eq(zeroToOne)
      expect(implOneToZero).to.be.eq(oneToZero)
    });
  });
});
