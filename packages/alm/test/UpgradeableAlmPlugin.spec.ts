import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { UpgradeableAlmPluginTest, AlmPluginImplementation, MockFactory } from '../typechain';
import { ZERO_ADDRESS } from 'test-utils/consts';
import { Wallet } from 'ethers';

describe('#UpgradeableAlmPlugin', () => {
  let almImplementation: AlmPluginImplementation;
  let pluginLogic: UpgradeableAlmPluginTest;
  let pluginProxy: UpgradeableAlmPluginTest;
  let mockFactory: MockFactory;
  let wallet: Wallet;
  let other: Wallet;

  const SLOW_TWAP_PERIOD = 3600; // 1 hour
  const FAST_TWAP_PERIOD = 300;  // 5 minutes
  const MOCK_POOL = '0x0000000000000000000000000000000000000001';
  const MOCK_PLUGIN_FACTORY = '0x0000000000000000000000000000000000000004';
  const MOCK_REBALANCE_MANAGER = '0x0000000000000000000000000000000000000003';

  beforeEach(async () => {
    [wallet, other] = await (ethers as any).getSigners();

    // Deploy MockFactory
    const MockFactoryFactory = await ethers.getContractFactory('MockFactory');
    mockFactory = await MockFactoryFactory.deploy() as any as MockFactory;

    // Deploy ALM Implementation (shared logic)
    const almImplFactory = await ethers.getContractFactory('AlmPluginImplementation');
    almImplementation = await almImplFactory.deploy() as any as AlmPluginImplementation;

    // Deploy Plugin Logic (with real factory, pluginFactory, and implementation address as immutables)
    const pluginLogicFactory = await ethers.getContractFactory('UpgradeableAlmPluginTest');
    pluginLogic = await pluginLogicFactory.deploy(
      await mockFactory.getAddress(),
      MOCK_PLUGIN_FACTORY,
      await almImplementation.getAddress()
    ) as any as UpgradeableAlmPluginTest;

    // Deploy Beacon Proxy (using OpenZeppelin's BeaconProxy)
    const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

    const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
    const proxy = await AlgebraPluginProxyFactory.deploy(
      await beacon.getAddress(),
      MOCK_POOL,
      '0x' // Empty data - we'll call initialize separately
    );

    // Get proxy as UpgradeableAlmPluginTest interface
    pluginProxy = await ethers.getContractAt('UpgradeableAlmPluginTest', await proxy.getAddress()) as any as UpgradeableAlmPluginTest;
  });

  describe('#initialization', () => {
    it('should initialize with correct values', async () => {
      // Grant role to wallet for initialization
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);
      
      await pluginProxy.initialize(MOCK_POOL);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
      expect(await pluginProxy.factory()).to.eq(await mockFactory.getAddress());

      // ALM is NOT configured during plugin init
      expect(await pluginProxy.rebalanceManager.staticCall()).to.eq(ZERO_ADDRESS);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(0);
      expect(await pluginProxy.fastTwapPeriod.staticCall()).to.eq(0);
    });

    it('should not allow double initialization', async () => {
      // Grant role to wallet for initialization
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);
      
      await pluginProxy.initialize(MOCK_POOL);

      await expect(
        pluginProxy.initialize(MOCK_POOL)
      ).to.be.reverted;
    });
  });

  describe('#initializeALM', () => {
    beforeEach(async () => {
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);
      await pluginProxy.initialize(MOCK_POOL);
    });

    it('should initialize ALM config with correct values', async () => {
      await pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD);

      expect(await pluginProxy.rebalanceManager.staticCall()).to.eq(MOCK_REBALANCE_MANAGER);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(SLOW_TWAP_PERIOD);
      expect(await pluginProxy.fastTwapPeriod.staticCall()).to.eq(FAST_TWAP_PERIOD);
    });

    it('should revert if slowTwapPeriod < fastTwapPeriod', async () => {
      await expect(
        pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, 100, 200)
      ).to.be.revertedWith('_slowTwapPeriod must be >= _fastTwapPeriod');
    });

    it('should revert if rebalanceManager is zero address', async () => {
      await expect(
        pluginProxy.initializeALM(ZERO_ADDRESS, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD)
      ).to.be.revertedWith('_rebalanceManager must be non zero address');
    });
  });

  describe('#setters', () => {
    beforeEach(async () => {
      // Grant role to wallet for initialization and setters
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);

      await pluginProxy.initialize(MOCK_POOL);
      await pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD);
    });

    it('should update slowTwapPeriod', async () => {
      const newPeriod = 7200;
      await pluginProxy.setSlowTwapPeriod(newPeriod);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(newPeriod);
    });

    it('should update fastTwapPeriod', async () => {
      const newPeriod = 600;
      await pluginProxy.setFastTwapPeriod(newPeriod);
      expect(await pluginProxy.fastTwapPeriod.staticCall()).to.eq(newPeriod);
    });

    it('should update rebalanceManager', async () => {
      const newManager = '0x0000000000000000000000000000000000000099';
      await pluginProxy.setRebalanceManager(newManager);
      expect(await pluginProxy.rebalanceManager.staticCall()).to.eq(newManager);
    });

    it('should revert setSlowTwapPeriod if less than fastTwapPeriod', async () => {
      await expect(
        pluginProxy.setSlowTwapPeriod(100) // less than FAST_TWAP_PERIOD
      ).to.be.revertedWith('_slowTwapPeriod must be >= fastTwapPeriod');
    });

    it('should revert setFastTwapPeriod if greater than slowTwapPeriod', async () => {
      await expect(
        pluginProxy.setFastTwapPeriod(10000) // greater than SLOW_TWAP_PERIOD
      ).to.be.revertedWith('_fastTwapPeriod must be <= slowTwapPeriod');
    });
  });

  describe('#storage isolation', () => {
    it('should have isolated storage between proxies', async () => {
      // Grant role to wallet for initialization
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), wallet.address);

      // Deploy second proxy
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), MOCK_POOL, '0x');

      const pluginProxy2 = await ethers.getContractAt('UpgradeableAlmPluginTest', await proxy2.getAddress()) as any as UpgradeableAlmPluginTest;

      // Initialize both with different values
      const MANAGER_1 = '0x0000000000000000000000000000000000000033';
      const MANAGER_2 = '0x0000000000000000000000000000000000000044';

      await pluginProxy.initialize(MOCK_POOL);
      await pluginProxy2.initialize(MOCK_POOL);

      await pluginProxy.initializeALM(MANAGER_1, 1000, 100);
      await pluginProxy2.initializeALM(MANAGER_2, 2000, 200);
      
      expect(await pluginProxy.rebalanceManager.staticCall()).to.eq(MANAGER_1);
      expect(await pluginProxy2.rebalanceManager.staticCall()).to.eq(MANAGER_2);
      
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(1000);
      expect(await pluginProxy2.slowTwapPeriod.staticCall()).to.eq(2000);
      
      expect(await pluginProxy.fastTwapPeriod.staticCall()).to.eq(100);
      expect(await pluginProxy2.fastTwapPeriod.staticCall()).to.eq(200);
    });
  });

  describe('#immutables', () => {
    it('should share implementation address across proxies', async () => {
      // Deploy second proxy
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), MOCK_POOL, '0x');

      const pluginProxy2 = await ethers.getContractAt('UpgradeableAlmPluginTest', await proxy2.getAddress()) as any as UpgradeableAlmPluginTest;

      // Both should have the same implementation address (immutable from logic contract)
      expect(await pluginProxy.getAlmImplementation()).to.eq(await almImplementation.getAddress());
      expect(await pluginProxy2.getAlmImplementation()).to.eq(await almImplementation.getAddress());
      expect(await pluginProxy.getAlmImplementation()).to.eq(await pluginProxy2.getAlmImplementation());
    });
  });

  describe('#authorization', () => {
    it('should allow factory owner to call initialize', async () => {
      // wallet is the owner of MockFactory
      await pluginProxy.initialize(MOCK_POOL);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
    });

    it('should allow user with ALGEBRA_BASE_PLUGIN_MANAGER role to call initialize', async () => {
      // Grant role to 'other' user
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);
      
      // Connect as 'other' and initialize
      await pluginProxy.connect(other).initialize(MOCK_POOL);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
    });

    it('should revert when unauthorized user calls initialize', async () => {
      // 'other' is not owner and has no role
      await expect(
        pluginProxy.connect(other).initialize(MOCK_POOL)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should allow factory owner to call setters', async () => {
      // wallet is the owner, initialize first
      await pluginProxy.initialize(MOCK_POOL);
      await pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD);

      // Owner can call setters
      await pluginProxy.setSlowTwapPeriod(7200);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(7200);
    });

    it('should allow user with role to call setters', async () => {
      // Initialize as owner first
      await pluginProxy.initialize(MOCK_POOL);
      await pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD);

      // Grant role to 'other'
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can call setters
      await pluginProxy.connect(other).setSlowTwapPeriod(7200);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(7200);

      await pluginProxy.connect(other).setFastTwapPeriod(600);
      expect(await pluginProxy.fastTwapPeriod.staticCall()).to.eq(600);

      const newManager = '0x0000000000000000000000000000000000000099';
      await pluginProxy.connect(other).setRebalanceManager(newManager);
      expect(await pluginProxy.rebalanceManager.staticCall()).to.eq(newManager);
    });

    it('should revert when unauthorized user calls setSlowTwapPeriod', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL);

      // 'other' has no role
      await expect(
        pluginProxy.connect(other).setSlowTwapPeriod(7200)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should revert when unauthorized user calls setFastTwapPeriod', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL);

      // 'other' has no role
      await expect(
        pluginProxy.connect(other).setFastTwapPeriod(100)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should revert when unauthorized user calls setRebalanceManager', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL);

      // 'other' has no role
      const newManager = '0x0000000000000000000000000000000000000099';
      await expect(
        pluginProxy.connect(other).setRebalanceManager(newManager)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should not allow calling setters after role revocation', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL);
      await pluginProxy.initializeALM(MOCK_REBALANCE_MANAGER, SLOW_TWAP_PERIOD, FAST_TWAP_PERIOD);

      // Grant role to 'other'
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can call setter
      await pluginProxy.connect(other).setSlowTwapPeriod(7200);
      expect(await pluginProxy.slowTwapPeriod.staticCall()).to.eq(7200);

      // Revoke role
      await mockFactory.revokeRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can no longer call setter
      await expect(
        pluginProxy.connect(other).setSlowTwapPeriod(9000)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });
  });
});
