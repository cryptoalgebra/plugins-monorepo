import { ethers } from 'hardhat';
import { pinnedPluginProxyFactory } from 'test-utils/pinnedProxy';
import { expect } from 'chai';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { encodePriceSqrt } from 'test-utils/utilities';

describe('UpgradeableVolatilityOraclePlugin', function () {
  const TWAP_PERIOD = 3600;

  // afterInitialize seeds the oracle, beforeSwap writes into it
  async function initializedFixture() {
    const fixture = await loadFixture(deployFixture);
    await fixture.mockPool.initialize(encodePriceSqrt(1, 1));
    return fixture;
  }

  async function deployFixture() {
    const [owner, manager, user, otherUser] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy MockPluginFactory
    const MockPluginFactory = await ethers.getContractFactory('MockPluginFactory');
    const mockPluginFactory = await MockPluginFactory.deploy();

    // Deploy MockPool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy VolatilityOraclePluginImplementation
    const VolatilityOraclePluginImplementation = await ethers.getContractFactory('VolatilityOraclePluginImplementation');
    const volatilityOracleImpl = await VolatilityOraclePluginImplementation.deploy();

    // Deploy UpgradeableVolatilityOraclePluginTest (implementation for beacon)
    const UpgradeableVolatilityOraclePluginTest = await ethers.getContractFactory('UpgradeableVolatilityOraclePluginTest');
    const pluginImplementation = await UpgradeableVolatilityOraclePluginTest.deploy(
      mockFactory.target,
      mockPluginFactory.target,
      volatilityOracleImpl.target
    );

    // Deploy UpgradeableBeacon
    const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await UpgradeableBeacon.deploy(pluginImplementation.target);

    // Deploy pool-aware proxy (required for POOL_ADDRESS_OFFSET-based pool discovery)
    const AlgebraPluginProxy = await pinnedPluginProxyFactory();
    const initData = pluginImplementation.interface.encodeFunctionData('initializePlugin');
    const proxy1 = await AlgebraPluginProxy.deploy(beacon.target, mockPool.target, initData);

    // Get plugin interface for proxy
    const plugin1 = UpgradeableVolatilityOraclePluginTest.attach(proxy1.target) as any;

    // Set plugin in mock pool
    await mockPool.setPlugin(proxy1.target);

    // Grant manager role to manager
    const ALGEBRA_BASE_PLUGIN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_MANAGER'));
    await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_MANAGER, manager.address);

    return {
      owner,
      manager,
      user,
      otherUser,
      mockFactory,
      mockPluginFactory,
      mockPool,
      volatilityOracleImpl,
      pluginImplementation,
      beacon,
      plugin1,
      UpgradeableVolatilityOraclePluginTest,
      ALGEBRA_BASE_PLUGIN_MANAGER,
    };
  }

  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
    });

    it('should have Volatility Oracle Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Volatility Oracle Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initializePlugin()
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // AFTER_INIT_FLAG | BEFORE_SWAP_FLAG = 64 | 1 = 65
      const BEFORE_SWAP_FLAG = 1n;
      const AFTER_INIT_FLAG = 1n << 6n;
      const expectedConfig = BEFORE_SWAP_FLAG | AFTER_INIT_FLAG;
      
      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(expectedConfig);
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        beacon,
        pluginImplementation,
        plugin1,
        UpgradeableVolatilityOraclePluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const AlgebraPluginProxy = await pinnedPluginProxyFactory();
      const proxy2 = await AlgebraPluginProxy.deploy(beacon.target, mockPool2.target, '0x');
      const plugin2 = UpgradeableVolatilityOraclePluginTest.attach(proxy2.target) as any;

      await mockPool2.setPlugin(proxy2.target);

      // Initialization state is stored per-proxy (must be isolated)
      await expect(plugin1.initializePlugin()).to.be.revertedWith('Initializable: contract is already initialized');
      await expect(plugin2.initializePlugin()).to.not.be.reverted;
      await expect(plugin2.initializePlugin()).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        beacon,
        mockFactory,
        mockPluginFactory,
        pluginImplementation,
        plugin1,
        UpgradeableVolatilityOraclePluginTest,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const MockPool = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPool.deploy();

      // Deploy second proxy
      const AlgebraPluginProxy = await pinnedPluginProxyFactory();
      const initData2 = pluginImplementation.interface.encodeFunctionData('initializePlugin');
      const proxy2 = await AlgebraPluginProxy.deploy(beacon.target, mockPool2.target, initData2);
      const plugin2 = UpgradeableVolatilityOraclePluginTest.attach(proxy2.target) as any;

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(mockPluginFactory.target);
      expect(await plugin2.pluginFactory()).to.equal(mockPluginFactory.target);
    });
  });

  describe('Authorization', function () {
    // prepayTimepointsStorageSlots is the connector's only _authorize guarded entry point
    it('should allow owner to call authorized functions', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      await expect(plugin1.prepayTimepointsStorageSlots(1, 10)).to.not.be.reverted;
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).prepayTimepointsStorageSlots(1, 10)).to.not.be.reverted;
    });

    it('should reject a caller with neither ownership nor the role', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(plugin1.connect(user).prepayTimepointsStorageSlots(1, 10)).to.be.revertedWith('Not authorized');
    });
  });

  // Everything above tests the proxy. The module's own logic - writing timepoints, the TWAP and the
  // volatility average - is only reached through a composed plugin in another package, so none of it
  // has a test at this layer. These drive it through MockPool, the way a real pool would.
  describe('Oracle behaviour', function () {
    it('should be initialized by the pool and refuse a second initialize', async function () {
      const { plugin1 } = await initializedFixture();

      expect(await plugin1.isInitialized()).to.be.true;
      expect(await plugin1.timepointIndex()).to.equal(0);
      expect(await plugin1.lastTimepointTimestamp()).to.equal(await time.latest());

      await expect(plugin1.initialize()).to.be.revertedWith('Already initialized');
    });

    it('should refuse initialize while the pool has no price', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      await expect(plugin1.initialize()).to.be.revertedWith('Pool is not initialized');
    });

    // This harness reads the real block.timestamp, so two swaps are always a second apart and the
    // same-second case cannot be reached here. It is covered in default-plugin, whose MockTime plugin
    // holds its own clock still.
    it('should write a timepoint on a swap once time has passed', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      const indexAtStart = await plugin1.timepointIndex();

      await time.increase(60);
      await mockPool.swapToTick(100);

      expect(await plugin1.timepointIndex()).to.equal(indexAtStart + 1n);
      expect(await plugin1.lastTimepointTimestamp()).to.equal(await time.latest());
    });

    it('should refuse a zero TWAP period', async function () {
      const { plugin1 } = await initializedFixture();

      await expect(plugin1.getTwapTick.staticCall(0)).to.be.revertedWith('Period is zero');
    });

    it('should report canGetTwap only once the history reaches the period', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      expect(await plugin1.canGetTwap.staticCall(TWAP_PERIOD)).to.be.false;

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(0);

      expect(await plugin1.canGetTwap.staticCall(TWAP_PERIOD)).to.be.true;
    });

    it('should average a flat tick to that tick', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(0);

      expect(await plugin1.getTwapTick.staticCall(TWAP_PERIOD)).to.equal(0);
    });

    it('should trail the current tick after the price moves', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(600);
      await time.increase(TWAP_PERIOD / 2);
      await mockPool.swapToTick(600);

      const twapTick = await plugin1.getTwapTick.staticCall(TWAP_PERIOD);

      // Half the window sat at 0 and half at 600, so the average is strictly between them
      expect(twapTick).to.be.greaterThan(0);
      expect(twapTick).to.be.lessThan(600);
    });

    // getTwapTick truncates towards zero and then corrects, so a negative window that does not divide
    // evenly by the period has to come back one tick lower than plain integer division gives
    it('should round a negative average down rather than towards zero', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(-100);
      // A partial stretch at a negative tick, chosen so the cumulative delta leaves a remainder
      await time.increase(1000);
      await mockPool.swapToTick(-100);

      const [now] = await plugin1.getSingleTimepoint(0);
      const [then] = await plugin1.getSingleTimepoint(TWAP_PERIOD);
      const delta = now - then;

      // Both halves of the correction's condition, so the case cannot drift into being trivial
      expect(delta).to.be.lessThan(0n);
      expect(delta % BigInt(TWAP_PERIOD)).to.not.equal(0n);

      // BigInt division truncates towards zero, the contract must land one below it
      const truncated = delta / BigInt(TWAP_PERIOD);
      expect(await plugin1.getTwapTick.staticCall(TWAP_PERIOD)).to.equal(truncated - 1n);
    });

    it('should report no volatility for a flat tick and some once it moves', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(0);
      expect(await plugin1.getAverageVolatilityLast()).to.equal(0);

      await time.increase(TWAP_PERIOD);
      await mockPool.swapToTick(600);
      await time.increase(TWAP_PERIOD);
      await mockPool.swapToTick(600);

      expect(await plugin1.getAverageVolatilityLast()).to.be.greaterThan(0);
    });

    it('should return cumulatives that grow with the elapsed time', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(600);
      await time.increase(TWAP_PERIOD);
      await mockPool.swapToTick(600);

      const [cumulativeNow] = await plugin1.getSingleTimepoint(0);
      const [cumulativeThen] = await plugin1.getSingleTimepoint(TWAP_PERIOD);

      expect(cumulativeNow - cumulativeThen).to.equal(BigInt(TWAP_PERIOD) * (await plugin1.getTwapTick.staticCall(TWAP_PERIOD)));
    });
  });

  // The connector exposes the raw ring buffer alongside the computed views, and neither raw reader
  // had a caller. The guarded delegatecall in canGetTwap had none either.
  describe('Raw timepoint access', function () {
    it('should expose the seeded timepoint through the ring buffer getter', async function () {
      const { plugin1 } = await initializedFixture();

      const tp = await plugin1.timepoints(0);

      expect(tp.initialized).to.be.true;
      expect(tp.blockTimestamp).to.equal(await time.latest());
      expect(tp.tickCumulative).to.equal(0);
    });

    it('should return an empty slot for an index never written', async function () {
      const { plugin1 } = await initializedFixture();

      const tp = await plugin1.timepoints(1);

      expect(tp.initialized).to.be.false;
      expect(tp.blockTimestamp).to.equal(0);
    });

    it('should answer a batch of secondsAgos consistently with the single reader', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await time.increase(2 * TWAP_PERIOD);
      await mockPool.swapToTick(600);

      const [batch] = await plugin1.getTimepoints([0, TWAP_PERIOD]);
      const [now] = await plugin1.getSingleTimepoint(0);
      const [then] = await plugin1.getSingleTimepoint(TWAP_PERIOD);

      expect(batch[0]).to.equal(now);
      expect(batch[1]).to.equal(then);
    });

    // prepayTimepointsStorageSlots exists so later writes land in slots that are already paid for.
    // The three authorization cases call it and stop, so the sequence it exists for was never run.
    it('should write timepoints into slots that were prepaid', async function () {
      const { plugin1, mockPool } = await initializedFixture();

      await plugin1.prepayTimepointsStorageSlots(1, 5);

      // Prepaying must not look like a written timepoint to anything reading the buffer
      expect((await plugin1.timepoints(1)).initialized).to.be.false;
      expect(await plugin1.timepointIndex()).to.equal(0);

      await time.increase(60);
      await mockPool.swapToTick(100);

      const written = await plugin1.timepoints(1);
      expect(written.initialized).to.be.true;
      expect(written.blockTimestamp).to.equal(await time.latest());
      expect(await plugin1.timepointIndex()).to.equal(1);
    });

    it('should keep prepaying idempotent over a range already paid for', async function () {
      const { plugin1 } = await initializedFixture();

      await plugin1.prepayTimepointsStorageSlots(1, 5);

      await expect(plugin1.prepayTimepointsStorageSlots(1, 5)).to.not.be.reverted;
      expect((await plugin1.timepoints(1)).initialized).to.be.false;
    });

    it('should report canGetTwap false rather than revert for a period beyond the clock', async function () {
      const { plugin1 } = await initializedFixture();

      // currentTime - period underflows inside the module, and the connector swallows that
      expect(await plugin1.canGetTwap.staticCall(4294967295)).to.be.false;
    });
  });
});
