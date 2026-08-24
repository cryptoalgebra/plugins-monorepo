import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { UpgradeableDynamicFeePluginTest, DynamicFeePluginImplementation, MockFactory } from '../typechain';
import { Wallet } from 'ethers';

describe('#UpgradeableDynamicFeePlugin', () => {
  let dynamicFeeImplementation: DynamicFeePluginImplementation;
  let pluginLogic: UpgradeableDynamicFeePluginTest;
  let pluginProxy: UpgradeableDynamicFeePluginTest;
  let mockFactory: MockFactory;
  let wallet: Wallet;
  let other: Wallet;

  const MOCK_POOL = '0x0000000000000000000000000000000000000001';
  const MOCK_PLUGIN_FACTORY = '0x0000000000000000000000000000000000000004';

  // Default fee configuration
  const DEFAULT_FEE_CONFIG = {
    alpha1: 2900,
    alpha2: 12000,
    beta1: 360,
    beta2: 60000,
    gamma1: 59,
    gamma2: 8500,
    baseFee: 100,
  };

  // Alternative fee configuration for testing changes
  const ALT_FEE_CONFIG = {
    alpha1: 3000,
    alpha2: 15000,
    beta1: 400,
    beta2: 70000,
    gamma1: 60,
    gamma2: 9000,
    baseFee: 200,
  };

  beforeEach(async () => {
    [wallet, other] = await (ethers as any).getSigners();

    // Deploy MockFactory
    const MockFactoryFactory = await ethers.getContractFactory('MockFactory');
    mockFactory = await MockFactoryFactory.deploy() as any as MockFactory;

    // Deploy DynamicFee Implementation (shared logic)
    const dynamicFeeImplFactory = await ethers.getContractFactory('DynamicFeePluginImplementation');
    dynamicFeeImplementation = await dynamicFeeImplFactory.deploy() as any as DynamicFeePluginImplementation;

    // Deploy Plugin Logic (with real factory, pluginFactory, and implementation address as immutables)
    const pluginLogicFactory = await ethers.getContractFactory('UpgradeableDynamicFeePluginTest');
    pluginLogic = await pluginLogicFactory.deploy(
      await mockFactory.getAddress(),
      MOCK_PLUGIN_FACTORY,
      await dynamicFeeImplementation.getAddress()
    ) as any as UpgradeableDynamicFeePluginTest;

    // Deploy Beacon Proxy (using OpenZeppelin's BeaconProxy)
    const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

    const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
    const proxy = await AlgebraPluginProxyFactory.deploy(
      await beacon.getAddress(),
      MOCK_POOL,
      '0x' // Empty data - we'll call initialize separately
    );

    // Get proxy as UpgradeableDynamicFeePluginTest interface
    pluginProxy = await ethers.getContractAt('UpgradeableDynamicFeePluginTest', await proxy.getAddress()) as any as UpgradeableDynamicFeePluginTest;
  });

  describe('#initialization', () => {
    it('should initialize with correct values', async () => {
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
      expect(await pluginProxy.factory()).to.eq(await mockFactory.getAddress());
      
      const config = await pluginProxy.feeConfig.staticCall();
      expect(config.alpha1).to.eq(DEFAULT_FEE_CONFIG.alpha1);
      expect(config.alpha2).to.eq(DEFAULT_FEE_CONFIG.alpha2);
      expect(config.beta1).to.eq(DEFAULT_FEE_CONFIG.beta1);
      expect(config.beta2).to.eq(DEFAULT_FEE_CONFIG.beta2);
      expect(config.gamma1).to.eq(DEFAULT_FEE_CONFIG.gamma1);
      expect(config.gamma2).to.eq(DEFAULT_FEE_CONFIG.gamma2);
      expect(config.baseFee).to.eq(DEFAULT_FEE_CONFIG.baseFee);
    });

    it('should not allow double initialization', async () => {
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      await expect(
        pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should revert with invalid fee configuration (alpha1 + alpha2 + baseFee > max)', async () => {
      const invalidConfig = {
        alpha1: 60000,
        alpha2: 60000,
        beta1: 360,
        beta2: 60000,
        gamma1: 59,
        gamma2: 8500,
        baseFee: 1000, // Total would exceed uint16 max
      };

      await expect(
        pluginProxy.initialize(MOCK_POOL, invalidConfig)
      ).to.be.revertedWith('Max fee exceeded');
    });
  });

  describe('#changeFeeConfiguration', () => {
    beforeEach(async () => {
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);
    });

    it('should update fee configuration', async () => {
      await pluginProxy.changeFeeConfiguration(ALT_FEE_CONFIG);
      
      const config = await pluginProxy.feeConfig.staticCall();
      expect(config.alpha1).to.eq(ALT_FEE_CONFIG.alpha1);
      expect(config.alpha2).to.eq(ALT_FEE_CONFIG.alpha2);
      expect(config.beta1).to.eq(ALT_FEE_CONFIG.beta1);
      expect(config.beta2).to.eq(ALT_FEE_CONFIG.beta2);
      expect(config.gamma1).to.eq(ALT_FEE_CONFIG.gamma1);
      expect(config.gamma2).to.eq(ALT_FEE_CONFIG.gamma2);
      expect(config.baseFee).to.eq(ALT_FEE_CONFIG.baseFee);
    });

    it('should emit FeeConfiguration event', async () => {
      await expect(pluginProxy.changeFeeConfiguration(ALT_FEE_CONFIG))
        .to.emit(pluginProxy, 'FeeConfiguration');
    });

    it('should revert with invalid configuration', async () => {
      const invalidConfig = {
        alpha1: 60000,
        alpha2: 60000,
        beta1: 360,
        beta2: 60000,
        gamma1: 59,
        gamma2: 8500,
        baseFee: 1000,
      };

      await expect(
        pluginProxy.changeFeeConfiguration(invalidConfig)
      ).to.be.revertedWith('Max fee exceeded');
    });
  });

  describe('#storage isolation', () => {
    it('should have isolated storage between proxies', async () => {
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy1 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), MOCK_POOL, '0x');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), MOCK_POOL, '0x');

      const pluginProxy1 = await ethers.getContractAt(
        'UpgradeableDynamicFeePluginTest',
        await proxy1.getAddress()
      ) as any as UpgradeableDynamicFeePluginTest;
      const pluginProxy2 = await ethers.getContractAt(
        'UpgradeableDynamicFeePluginTest',
        await proxy2.getAddress()
      ) as any as UpgradeableDynamicFeePluginTest;

      // Initialize both with different values
      await pluginProxy1.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);
      await pluginProxy2.initialize(MOCK_POOL, ALT_FEE_CONFIG);
      
      const config1 = await pluginProxy1.feeConfig.staticCall();
      const config2 = await pluginProxy2.feeConfig.staticCall();
      
      expect(config1.baseFee).to.eq(DEFAULT_FEE_CONFIG.baseFee);
      expect(config2.baseFee).to.eq(ALT_FEE_CONFIG.baseFee);
      
      expect(config1.alpha1).to.eq(DEFAULT_FEE_CONFIG.alpha1);
      expect(config2.alpha1).to.eq(ALT_FEE_CONFIG.alpha1);
    });
  });

  describe('#immutables', () => {
    it('should share implementation address across proxies', async () => {
      // Deploy second proxy
      const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
      const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

      const AlgebraPluginProxyFactory = await ethers.getContractFactory('AlgebraPluginProxy');
      const proxy2 = await AlgebraPluginProxyFactory.deploy(await beacon.getAddress(), MOCK_POOL, '0x');

      const pluginProxy2 = await ethers.getContractAt('UpgradeableDynamicFeePluginTest', await proxy2.getAddress()) as any as UpgradeableDynamicFeePluginTest;

      // Both should have the same implementation address (immutable from logic contract)
      expect(await pluginProxy.getDynamicFeeImplementation()).to.eq(await dynamicFeeImplementation.getAddress());
      expect(await pluginProxy2.getDynamicFeeImplementation()).to.eq(await dynamicFeeImplementation.getAddress());
      expect(await pluginProxy.getDynamicFeeImplementation()).to.eq(await pluginProxy2.getDynamicFeeImplementation());
    });
  });

  describe('#authorization', () => {
    it('should allow factory owner to call initialize', async () => {
      // wallet is the owner of MockFactory
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
    });

    it('should allow user with ALGEBRA_BASE_PLUGIN_MANAGER role to call initialize', async () => {
      // Grant role to 'other' user
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);
      
      // Connect as 'other' and initialize
      await pluginProxy.connect(other).initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      expect(await pluginProxy.pool()).to.eq(MOCK_POOL);
    });

    it('should revert when unauthorized user calls initialize', async () => {
      // 'other' is not owner and has no role
      await expect(
        pluginProxy.connect(other).initialize(MOCK_POOL, DEFAULT_FEE_CONFIG)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should allow factory owner to call changeFeeConfiguration', async () => {
      // wallet is the owner, initialize first
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      // Owner can call changeFeeConfiguration
      await pluginProxy.changeFeeConfiguration(ALT_FEE_CONFIG);
      const config = await pluginProxy.feeConfig.staticCall();
      expect(config.baseFee).to.eq(ALT_FEE_CONFIG.baseFee);
    });

    it('should allow user with role to call changeFeeConfiguration', async () => {
      // Initialize as owner first
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      // Grant role to 'other'
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can call changeFeeConfiguration
      await pluginProxy.connect(other).changeFeeConfiguration(ALT_FEE_CONFIG);
      const config = await pluginProxy.feeConfig.staticCall();
      expect(config.baseFee).to.eq(ALT_FEE_CONFIG.baseFee);
    });

    it('should revert when unauthorized user calls changeFeeConfiguration', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      // 'other' has no role
      await expect(
        pluginProxy.connect(other).changeFeeConfiguration(ALT_FEE_CONFIG)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });

    it('should not allow calling changeFeeConfiguration after role revocation', async () => {
      // Initialize as owner
      await pluginProxy.initialize(MOCK_POOL, DEFAULT_FEE_CONFIG);

      // Grant role to 'other'
      await mockFactory.grantRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can call changeFeeConfiguration
      await pluginProxy.connect(other).changeFeeConfiguration(ALT_FEE_CONFIG);

      // Revoke role
      await mockFactory.revokeRole(await pluginProxy.ALGEBRA_BASE_PLUGIN_MANAGER(), other.address);

      // 'other' can no longer call changeFeeConfiguration
      await expect(
        pluginProxy.connect(other).changeFeeConfiguration(DEFAULT_FEE_CONFIG)
      ).to.be.revertedWithCustomError(pluginProxy, 'OnlyAdministrator');
    });
  });
});
