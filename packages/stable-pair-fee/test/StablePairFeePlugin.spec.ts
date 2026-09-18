import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';

describe('StablePairFeePlugin', function () {
  const Q96 = 2n ** 96n;
  const UNDEFINED_DECAYING_FEE_E12 = 10n ** 12n + 1n;

  const MIN_SQRT_RATIO = 4295128739n;
  const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
  const SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6 = 994_987n;
  const MIN_REFERENCE = (MIN_SQRT_RATIO * 1_000_000n + SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6 - 1n) / SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6;
  const MAX_REFERENCE = (MAX_SQRT_RATIO * SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6) / 1_000_000n;

  const DEFAULT_CONFIG = {
    k: 16_609_443n,
    optimalFeeE6: 90n,
    targetMultiplier: 50n,
    referenceSqrtPriceX96: Q96,
  };

  // Reference price * 1.001, outside the optimal range
  const ABOVE_RANGE_PRICE = sqrtBigInt((Q96 * Q96 * 1_001n) / 1_000n);
  // Reference price * 1.002, further away
  const FURTHER_ABOVE_PRICE = sqrtBigInt((Q96 * Q96 * 1_002n) / 1_000n);

  function sqrtBigInt(x: bigint): bigint {
    if (x < 2n) return x;
    let z = x;
    let y = (x + 1n) / 2n;
    while (y < z) {
      z = y;
      y = (x / y + y) / 2n;
    }
    return z;
  }

  async function deployFixture() {
    const [owner, manager, user] = await ethers.getSigners();

    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    const BeaconProxyDeployer = await ethers.getContractFactory('BeaconProxyDeployer');
    const proxyDeployer = await BeaconProxyDeployer.deploy();

    const StablePairFeeMockPool = await ethers.getContractFactory('StablePairFeeMockPool');
    const mockPool = await StablePairFeeMockPool.deploy();

    const StablePairFeePluginImplementation = await ethers.getContractFactory('StablePairFeePluginImplementation');
    const stablePairFeeImpl = await StablePairFeePluginImplementation.deploy();

    const StablePairFeePluginTest = await ethers.getContractFactory('StablePairFeePluginTest');
    const pluginImplementation = await StablePairFeePluginTest.deploy(mockFactory.target, proxyDeployer.target, stablePairFeeImpl.target);

    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    const initData = pluginImplementation.interface.encodeFunctionData('initialize', []);
    await proxyDeployer.deploy(beacon.target, mockPool.target, initData);
    const plugin = StablePairFeePluginTest.attach(await proxyDeployer.lastDeployedProxy()) as any;

    await mockPool.setPlugin(plugin.target);

    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    const StableFeeCalculationTest = await ethers.getContractFactory('StableFeeCalculationTest');
    const calc = await StableFeeCalculationTest.deploy();

    return {
      owner,
      manager,
      user,
      mockFactory,
      proxyDeployer,
      mockPool,
      stablePairFeeImpl,
      pluginImplementation,
      beacon,
      plugin,
      calc,
      StablePairFeePluginTest,
    };
  }

  async function configuredFixture() {
    const f = await deployFixture();
    await f.mockPool.initialize(Q96);
    await f.plugin.setStableFeeConfig(DEFAULT_CONFIG);
    return f;
  }

  async function aboveRangeFixture() {
    const f = await deployFixture();
    await f.mockPool.initialize(ABOVE_RANGE_PRICE);
    await f.plugin.setStableFeeConfig(DEFAULT_CONFIG);
    return f;
  }

  // Decaying fee from a given start, or from the far boundary when start is null
  async function expectedDecayingFee(calc: any, sqrtPrice: bigint, decayStartFeeE12: bigint | null, blocksPassed: bigint) {
    const ratio: bigint = await calc.calculatePriceRatioX96(sqrtPrice, DEFAULT_CONFIG.referenceSqrtPriceX96);
    const close: bigint = await calc.calculateCloseBoundaryFee(ratio, DEFAULT_CONFIG.optimalFeeE6);
    const far: bigint = await calc.calculateFarBoundaryFee(ratio, DEFAULT_CONFIG.optimalFeeE6);
    const target = far - (close * DEFAULT_CONFIG.targetMultiplier) / 100n;
    let start = decayStartFeeE12 ?? far;
    if (start < target) start = target;
    return (await calc.calculateDecayingFee(target, start, DEFAULT_CONFIG.k, blocksPassed)) as bigint;
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin, mockPool } = await loadFixture(deployFixture);
      expect(await plugin.pool()).to.equal(mockPool.target);
      const config = await plugin.stableFeeConfig();
      expect(config.referenceSqrtPriceX96).to.equal(0);
    });

    it('should have Stable Pair Plugin in active modules', async function () {
      const { plugin } = await loadFixture(deployFixture);
      expect((await plugin.getActiveModuleNames())[0]).to.equal('Stable Pair Fee Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin } = await loadFixture(deployFixture);
      await expect(plugin.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin, mockPool } = await loadFixture(deployFixture);
      // BEFORE_SWAP_FLAG | DYNAMIC_FEE
      expect(await plugin.defaultPluginConfig()).to.equal(1n | (1n << 7n));
      await mockPool.initialize(Q96);
      expect((await mockPool.globalState()).pluginConfig).to.equal(1n | (1n << 7n));
    });
  });

  describe('Fee config', function () {
    it('should store config, reset state and emit', async function () {
      const { plugin } = await loadFixture(deployFixture);
      const tx = await plugin.setStableFeeConfig(DEFAULT_CONFIG);
      await expect(tx)
        .to.emit(plugin, 'StableFeeConfigUpdated')
        .withArgs([DEFAULT_CONFIG.k, DEFAULT_CONFIG.optimalFeeE6, DEFAULT_CONFIG.targetMultiplier, DEFAULT_CONFIG.referenceSqrtPriceX96]);

      const config = await plugin.stableFeeConfig();
      expect(config.k).to.equal(DEFAULT_CONFIG.k);
      expect(config.optimalFeeE6).to.equal(DEFAULT_CONFIG.optimalFeeE6);
      expect(config.targetMultiplier).to.equal(DEFAULT_CONFIG.targetMultiplier);
      expect(config.referenceSqrtPriceX96).to.equal(DEFAULT_CONFIG.referenceSqrtPriceX96);

      const state = await plugin.stableFeeState();
      expect(state.decayingFeeE12).to.equal(UNDEFINED_DECAYING_FEE_E12);
      expect(state.sqrtAmmPriceX96).to.equal(0);
      expect(state.blockNumber).to.equal((await tx.wait()).blockNumber);
    });

    it('should reset state written by swaps', async function () {
      const { plugin, mockPool } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(false, ABOVE_RANGE_PRICE);
      expect((await plugin.stableFeeState()).sqrtAmmPriceX96).to.equal(ABOVE_RANGE_PRICE);

      await plugin.setStableFeeConfig(DEFAULT_CONFIG);
      const state = await plugin.stableFeeState();
      expect(state.decayingFeeE12).to.equal(UNDEFINED_DECAYING_FEE_E12);
      expect(state.sqrtAmmPriceX96).to.equal(0);
    });

    it('should reject zero k', async function () {
      const { plugin } = await loadFixture(deployFixture);
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, k: 0 }))
        .to.be.revertedWithCustomError(plugin, 'InvalidK')
        .withArgs(0);
    });

    it('should accept optimal fee up to 1%', async function () {
      const { plugin } = await loadFixture(deployFixture);
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, optimalFeeE6: 10_000 })).to.emit(plugin, 'StableFeeConfigUpdated');
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, optimalFeeE6: 10_001 }))
        .to.be.revertedWithCustomError(plugin, 'InvalidOptimalFeeE6')
        .withArgs(10_001);
    });

    it('should accept target multiplier up to 100', async function () {
      const { plugin } = await loadFixture(deployFixture);
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, targetMultiplier: 100 })).to.emit(plugin, 'StableFeeConfigUpdated');
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, targetMultiplier: 101 }))
        .to.be.revertedWithCustomError(plugin, 'InvalidTargetMultiplier')
        .withArgs(101);
    });

    it('should enforce reference price bounds', async function () {
      const { plugin } = await loadFixture(deployFixture);
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, referenceSqrtPriceX96: MIN_REFERENCE })).to.emit(
        plugin,
        'StableFeeConfigUpdated'
      );
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, referenceSqrtPriceX96: MAX_REFERENCE - 1n })).to.emit(
        plugin,
        'StableFeeConfigUpdated'
      );
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, referenceSqrtPriceX96: MIN_REFERENCE - 1n }))
        .to.be.revertedWithCustomError(plugin, 'InvalidReferenceSqrtPriceX96')
        .withArgs(MIN_REFERENCE - 1n);
      await expect(plugin.setStableFeeConfig({ ...DEFAULT_CONFIG, referenceSqrtPriceX96: MAX_REFERENCE }))
        .to.be.revertedWithCustomError(plugin, 'InvalidReferenceSqrtPriceX96')
        .withArgs(MAX_REFERENCE);
    });

    it('should use floor sqrt of 99% for the bound constant', async function () {
      expect(sqrtBigInt(990_000n * 1_000_000n)).to.equal(SQRT_ONE_MINUS_MAX_OPTIMAL_FEE_E6);
    });
  });

  describe('Not configured', function () {
    it('should revert swaps', async function () {
      const { plugin, mockPool } = await loadFixture(deployFixture);
      await mockPool.initialize(Q96);
      await expect(mockPool.swapToPrice(true, Q96)).to.be.revertedWithCustomError(plugin, 'StableFeeNotConfigured');
    });

    it('should revert fee quotes', async function () {
      const { plugin, mockPool } = await loadFixture(deployFixture);
      await mockPool.initialize(Q96);
      await expect(plugin.getStableFees()).to.be.revertedWithCustomError(plugin, 'StableFeeNotConfigured');
    });
  });

  describe('Inside optimal range', function () {
    it('should charge the optimal fee in both directions at the reference price', async function () {
      const { mockPool } = await loadFixture(configuredFixture);
      await mockPool.swapToPrice(true, Q96);
      expect(await mockPool.overrideFee()).to.equal(DEFAULT_CONFIG.optimalFeeE6);
      await mockPool.swapToPrice(false, Q96);
      expect(await mockPool.overrideFee()).to.equal(DEFAULT_CONFIG.optimalFeeE6);
    });

    it('should keep pre-impact prices at the range bounds off the reference', async function () {
      const { mockPool, calc } = await loadFixture(configuredFixture);
      // Price * 1.00005, inside a 0.009% range
      const price = sqrtBigInt((Q96 * Q96 * 100_005n) / 100_000n);
      await mockPool.swapToPrice(true, price);
      const ratio = await calc.calculatePriceRatioX96(price, Q96);

      await mockPool.swapToPrice(true, price);
      const sellFee = await calc.toFeeE6(await calc.calculateInsideOptimalRangeFee(ratio, DEFAULT_CONFIG.optimalFeeE6, false, true));
      expect(await mockPool.overrideFee()).to.equal(sellFee);

      await mockPool.swapToPrice(false, price);
      const buyFee = await calc.toFeeE6(await calc.calculateInsideOptimalRangeFee(ratio, DEFAULT_CONFIG.optimalFeeE6, false, false));
      expect(await mockPool.overrideFee()).to.equal(buyFee);

      // Above the reference selling token0 costs more than buying it
      expect(sellFee).to.be.greaterThan(buyFee);
    });

    it('should mark the decaying fee undefined', async function () {
      const { plugin, mockPool } = await loadFixture(configuredFixture);
      await mockPool.swapToPrice(true, Q96);
      expect((await plugin.stableFeeState()).decayingFeeE12).to.equal(UNDEFINED_DECAYING_FEE_E12);
    });
  });

  describe('Outside optimal range', function () {
    it('should charge zero for swaps moving away from the reference', async function () {
      const { mockPool } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(false, ABOVE_RANGE_PRICE);
      expect(await mockPool.overrideFee()).to.equal(0);
    });

    it('should charge the far boundary decay for swaps moving toward the reference', async function () {
      const { plugin, mockPool, calc } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(true, ABOVE_RANGE_PRICE);

      // One block after the config update
      const expected = await expectedDecayingFee(calc, ABOVE_RANGE_PRICE, null, 1n);
      const state = await plugin.stableFeeState();
      expect(state.decayingFeeE12).to.equal(expected);
      expect(state.sqrtAmmPriceX96).to.equal(ABOVE_RANGE_PRICE);
      expect(await mockPool.overrideFee()).to.equal(await calc.toFeeE6(expected));
    });

    it('should decay the fee over blocks', async function () {
      const { plugin, mockPool, calc } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(true, ABOVE_RANGE_PRICE);
      const firstFee = (await plugin.stableFeeState()).decayingFeeE12;

      await mine(9);
      await mockPool.swapToPrice(true, ABOVE_RANGE_PRICE);

      // 9 mined plus the swap block
      const expected = await expectedDecayingFee(calc, ABOVE_RANGE_PRICE, firstFee, 10n);
      const secondFee = (await plugin.stableFeeState()).decayingFeeE12;
      expect(secondFee).to.equal(expected);
      expect(secondFee).to.be.lessThan(firstFee);
    });

    it('should raise the previous fee when the price moves further away', async function () {
      const { plugin, mockPool, calc } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(false, FURTHER_ABOVE_PRICE);
      const firstFee = (await plugin.stableFeeState()).decayingFeeE12;

      await mockPool.swapToPrice(true, FURTHER_ABOVE_PRICE);
      const movementRatio = await calc.calculatePriceRatioX96(FURTHER_ABOVE_PRICE, ABOVE_RANGE_PRICE);
      const adjusted = 10n ** 12n - (movementRatio * (10n ** 12n - firstFee)) / Q96;
      const expected = await expectedDecayingFee(calc, FURTHER_ABOVE_PRICE, adjusted, 1n);
      expect((await plugin.stableFeeState()).decayingFeeE12).to.equal(expected);
    });

    it('should restart from the far boundary after crossing the reference', async function () {
      const { plugin, mockPool, calc } = await loadFixture(aboveRangeFixture);
      const belowPrice = sqrtBigInt((Q96 * Q96 * 999n) / 1_000n);
      await mockPool.swapToPrice(true, belowPrice);

      await mockPool.swapToPrice(false, belowPrice);
      const ratio = await calc.calculatePriceRatioX96(belowPrice, Q96);
      const close = await calc.calculateCloseBoundaryFee(ratio, DEFAULT_CONFIG.optimalFeeE6);
      const far = await calc.calculateFarBoundaryFee(ratio, DEFAULT_CONFIG.optimalFeeE6);
      const target = far - (close * DEFAULT_CONFIG.targetMultiplier) / 100n;
      const expected = await calc.calculateDecayingFee(target, far, DEFAULT_CONFIG.k, 1n);

      expect((await plugin.stableFeeState()).decayingFeeE12).to.equal(expected);
      // Below the reference the charged direction flips
      expect(await mockPool.overrideFee()).to.equal(await calc.toFeeE6(expected));
    });
  });

  describe('Same block', function () {
    it('should use the start of block price and fee for later swaps', async function () {
      const { plugin, mockPool } = await loadFixture(aboveRangeFixture);
      await mine(1);

      await network.provider.send('evm_setAutomine', [false]);
      try {
        await mockPool.swapToPrice(true, FURTHER_ABOVE_PRICE, { gasLimit: 500_000 });
        await mockPool.swapToPrice(true, Q96, { gasLimit: 500_000 });
        await mine(1);
      } finally {
        await network.provider.send('evm_setAutomine', [true]);
      }

      const state = await plugin.stableFeeState();
      expect(state.sqrtAmmPriceX96).to.equal(ABOVE_RANGE_PRICE);
      // Second swap saw FURTHER_ABOVE_PRICE in the pool but paid the cached fee
      expect(await mockPool.overrideFee()).to.equal((state.decayingFeeE12 + 999_999n) / 1_000_000n);
    });
  });

  describe('Fee quote', function () {
    it('should match the fees the next swap pays', async function () {
      const { plugin, mockPool } = await loadFixture(aboveRangeFixture);
      await mockPool.swapToPrice(true, ABOVE_RANGE_PRICE);
      await mine(5);

      const [feeZeroToOne, feeOneToZero] = await plugin.getStableFees({ blockTag: 'pending' });

      const snapshot = await network.provider.send('evm_snapshot', []);
      await mockPool.swapToPrice(true, ABOVE_RANGE_PRICE);
      expect(await mockPool.overrideFee()).to.equal(feeZeroToOne);
      await network.provider.send('evm_revert', [snapshot]);

      await mockPool.swapToPrice(false, ABOVE_RANGE_PRICE);
      expect(await mockPool.overrideFee()).to.equal(feeOneToZero);
      expect(feeOneToZero).to.equal(0);
      expect(feeZeroToOne).to.be.greaterThan(0);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const { beacon, pluginImplementation, plugin, proxyDeployer, StablePairFeePluginTest } = await loadFixture(deployFixture);

      const StablePairFeeMockPool = await ethers.getContractFactory('StablePairFeeMockPool');
      const mockPool2 = await StablePairFeeMockPool.deploy();
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', []);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData);
      const plugin2 = StablePairFeePluginTest.attach(await proxyDeployer.lastDeployedProxy()) as any;

      await plugin.setStableFeeConfig(DEFAULT_CONFIG);
      await plugin2.setStableFeeConfig({ ...DEFAULT_CONFIG, optimalFeeE6: 500 });

      expect((await plugin.stableFeeConfig()).optimalFeeE6).to.equal(DEFAULT_CONFIG.optimalFeeE6);
      expect((await plugin2.stableFeeConfig()).optimalFeeE6).to.equal(500);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const { beacon, mockFactory, proxyDeployer, pluginImplementation, plugin, StablePairFeePluginTest } = await loadFixture(deployFixture);

      const StablePairFeeMockPool = await ethers.getContractFactory('StablePairFeeMockPool');
      const mockPool2 = await StablePairFeeMockPool.deploy();
      const initData = pluginImplementation.interface.encodeFunctionData('initialize', []);
      await proxyDeployer.deploy(beacon.target, mockPool2.target, initData);
      const plugin2 = StablePairFeePluginTest.attach(await proxyDeployer.lastDeployedProxy()) as any;

      expect(await plugin.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);
      expect(await plugin.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Authorization', function () {
    it('should allow owner to set fee config', async function () {
      const { plugin, owner } = await loadFixture(deployFixture);
      await expect(plugin.connect(owner).setStableFeeConfig(DEFAULT_CONFIG)).to.emit(plugin, 'StableFeeConfigUpdated');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to set fee config', async function () {
      const { plugin, manager } = await loadFixture(deployFixture);
      await expect(plugin.connect(manager).setStableFeeConfig(DEFAULT_CONFIG)).to.emit(plugin, 'StableFeeConfigUpdated');
    });

    it('should reject unauthorized users', async function () {
      const { plugin, user } = await loadFixture(deployFixture);
      await expect(plugin.connect(user).setStableFeeConfig(DEFAULT_CONFIG)).to.be.revertedWithCustomError(plugin, 'OnlyAdministrator');
    });

    it('should reject hook calls not from the pool', async function () {
      const { plugin, user } = await loadFixture(configuredFixture);
      await expect(plugin.connect(user).beforeSwap(user.address, user.address, true, 0, 0, false, '0x')).to.be.revertedWithCustomError(
        plugin,
        'OnlyPool'
      );
    });
  });
});
