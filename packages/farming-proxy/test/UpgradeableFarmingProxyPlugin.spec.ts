import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { 
  UpgradeableFarmingProxyPluginTest, 
  FarmingProxyPluginImplementation, 
  MockFactory, 
  MockFarmingPluginFactory,
  MockPool 
} from '../typechain';
import { Wallet } from 'ethers';

describe('#UpgradeableFarmingProxyPlugin', () => {
  let farmingProxyImplementation: FarmingProxyPluginImplementation;
  let pluginLogic: UpgradeableFarmingProxyPluginTest;
  let pluginProxy: UpgradeableFarmingProxyPluginTest;
  let mockFactory: MockFactory;
  let mockPluginFactory: MockFarmingPluginFactory;
  let mockPool: MockPool;
  let wallet: Wallet;
  let other: Wallet;
  let farmingAddress: Wallet;

  const MOCK_INCENTIVE = '0x0000000000000000000000000000000000000099';

  beforeEach(async () => {
    [wallet, other, farmingAddress] = await (ethers as any).getSigners();

    // Deploy MockFactory
    const MockFactoryFactory = await ethers.getContractFactory('MockFactory');
    mockFactory = await MockFactoryFactory.deploy() as any as MockFactory;

    // Deploy MockPluginFactory with farmingAddress
    const MockPluginFactoryFactory = await ethers.getContractFactory('MockFarmingPluginFactory');
    mockPluginFactory = await MockPluginFactoryFactory.deploy(farmingAddress.address) as any as MockFarmingPluginFactory;

    // Deploy MockPool
    const MockPoolFactory = await ethers.getContractFactory('MockPool');
    mockPool = await MockPoolFactory.deploy() as any as MockPool;

    // Deploy FarmingProxy Implementation (shared logic)
    const farmingProxyImplFactory = await ethers.getContractFactory('FarmingProxyPluginImplementation');
    farmingProxyImplementation = await farmingProxyImplFactory.deploy() as any as FarmingProxyPluginImplementation;

    // Deploy Plugin Logic (with real factory, pluginFactory, and implementation address as immutables)
    const pluginLogicFactory = await ethers.getContractFactory('UpgradeableFarmingProxyPluginTest');
    pluginLogic = await pluginLogicFactory.deploy(
      await mockFactory.getAddress(),
      await mockPluginFactory.getAddress(),
      await farmingProxyImplementation.getAddress()
    ) as any as UpgradeableFarmingProxyPluginTest;

    // Deploy Beacon Proxy (using OpenZeppelin's BeaconProxy)
    const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

    const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
    const proxy = await AlgebraPluginProxyFactory.deploy(
      await beacon.getAddress(),
      await mockPool.getAddress(),
      '0x' // Empty data - we'll call initialize separately
    );

    // Get proxy as UpgradeableFarmingProxyPluginTest interface
    pluginProxy = await ethers.getContractAt('UpgradeableFarmingProxyPluginTest', await proxy.getAddress()) as any as UpgradeableFarmingProxyPluginTest;

    // Set plugin in mockPool to proxy address
    await mockPool.setPlugin(await pluginProxy.getAddress());
  });

  describe('#initialization', () => {
    it('should initialize with correct values', async () => {
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.initialize(poolAddress);

      expect(await pluginProxy.pool()).to.eq(poolAddress);
      expect(await pluginProxy.factory()).to.eq(await mockFactory.getAddress());
      expect(await pluginProxy.incentive()).to.eq(ethers.ZeroAddress);
    });

    it('should not allow double initialization', async () => {
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.initialize(poolAddress);

      await expect(
        pluginProxy.initialize(poolAddress)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('#setIncentive', () => {
    beforeEach(async () => {
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.initialize(poolAddress);
    });

    it('should allow farming address to set incentive', async () => {
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);
      expect(await pluginProxy.incentive()).to.eq(MOCK_INCENTIVE);
    });

    it('should emit Incentive event', async () => {
      await expect(pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE))
        .to.emit(pluginProxy, 'Incentive')
        .withArgs(MOCK_INCENTIVE);
    });

    it('should revert when non-farming address tries to set incentive', async () => {
      await expect(
        pluginProxy.connect(other).setIncentive(MOCK_INCENTIVE)
      ).to.be.revertedWith('Not allowed to set incentive');
    });

    it('should revert when setting same incentive', async () => {
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);
      
      await expect(
        pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE)
      ).to.be.revertedWith('Already active');
    });

    it('should revert when setting new incentive while one is active', async () => {
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);
      
      const NEW_INCENTIVE = '0x0000000000000000000000000000000000000088';
      await expect(
        pluginProxy.connect(farmingAddress).setIncentive(NEW_INCENTIVE)
      ).to.be.revertedWith('Has active incentive');
    });

    it('should allow farming address to disconnect incentive', async () => {
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);
      expect(await pluginProxy.incentive()).to.eq(MOCK_INCENTIVE);
      
      await pluginProxy.connect(farmingAddress).setIncentive(ethers.ZeroAddress);
      expect(await pluginProxy.incentive()).to.eq(ethers.ZeroAddress);
    });

    it('should allow last incentive owner to disconnect incentive', async () => {
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);
      
      // Change farming address in plugin factory
      await mockPluginFactory.setFarmingAddress(other.address);
      
      // Original farmingAddress can still disconnect (as lastIncentiveOwner)
      await pluginProxy.connect(farmingAddress).setIncentive(ethers.ZeroAddress);
      expect(await pluginProxy.incentive()).to.eq(ethers.ZeroAddress);
    });
  });

  describe('#storage isolation', () => {
    it('should have isolated storage between proxies', async () => {
      // Deploy second proxy
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      // Deploy second mock pool
      const MockPoolFactory = await ethers.getContractFactory('MockPool');
      const mockPool2 = await MockPoolFactory.deploy() as any as MockPool;

      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), await mockPool2.getAddress(), '0x');

      const pluginProxy2 = await ethers.getContractAt('UpgradeableFarmingProxyPluginTest', await proxy2.getAddress()) as any as UpgradeableFarmingProxyPluginTest;
      await mockPool2.setPlugin(await pluginProxy2.getAddress());

      // Initialize both with different pools
      const pool1 = await mockPool.getAddress();
      const pool2 = await mockPool2.getAddress();

      await pluginProxy.initialize(pool1);
      await pluginProxy2.initialize(pool2);

      // Verify storage is isolated
      // Set incentive only on first proxy
      await pluginProxy.connect(farmingAddress).setIncentive(MOCK_INCENTIVE);

      expect(await pluginProxy.incentive()).to.eq(MOCK_INCENTIVE);
      expect(await pluginProxy2.incentive()).to.eq(ethers.ZeroAddress);
    });
  });

  describe('#immutables', () => {
    it('should share implementation address across proxies', async () => {
      // Deploy second proxy
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      // Use pool-aware proxy so _getPool works consistently
      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), await mockPool.getAddress(), '0x');

      const pluginProxy2 = await ethers.getContractAt('UpgradeableFarmingProxyPluginTest', await proxy2.getAddress()) as any as UpgradeableFarmingProxyPluginTest;

      // Both should have the same implementation address (immutable from logic contract)
      expect(await pluginProxy.getFarmingProxyImplementation()).to.eq(await farmingProxyImplementation.getAddress());
      expect(await pluginProxy2.getFarmingProxyImplementation()).to.eq(await farmingProxyImplementation.getAddress());
      expect(await pluginProxy.getFarmingProxyImplementation()).to.eq(await pluginProxy2.getFarmingProxyImplementation());
    });
  });

  describe('#authorization', () => {
    it('should allow factory owner to call initialize', async () => {
      // wallet is the owner of MockFactory
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.initialize(poolAddress);

      expect(await pluginProxy.pool()).to.eq(poolAddress);
    });

    it('should allow user with ALGEBRA_BASE_PLUGIN_MANAGER role to call initialize', async () => {
      // Grant role to 'other' user
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);
      
      // Connect as 'other' and initialize
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.connect(other).initialize(poolAddress);

      expect(await pluginProxy.pool()).to.eq(poolAddress);
    });

    it('should revert when unauthorized user calls initialize', async () => {
      // 'other' is not owner and has no role
      const poolAddress = await mockPool.getAddress();
      await expect(
        pluginProxy.connect(other).initialize(poolAddress)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });
  });

  describe('#getPool', () => {
    it('should return correct pool address', async () => {
      const poolAddress = await mockPool.getAddress();
      await pluginProxy.initialize(poolAddress);

      expect(await pluginProxy.getPool()).to.eq(poolAddress);
    });
  });
});
