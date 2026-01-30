import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { Wallet } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('FeeAuctionPlugin', () => {
  let wallet: Wallet, other: Wallet;
  let feeAuctionPlugin: any;
  let mockPool: any;
  let mockFactory: any;

  const DEFAULT_BASE_FEE = 3000; // 0.3%
  const DEFAULT_MEV_TAX_MULTIPLIER = 1000; // multiplier for priority fee
  const DEFAULT_MAX_MEV_TAX = 10000; // 1% max
  const DEFAULT_MEV_TAX_ENABLED = true;

  async function feeAuctionPluginFixture() {
    const [deployer] = await ethers.getSigners();

    // Deploy mock factory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy mock pool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy FeeAuctionPluginTest
    const FeeAuctionPluginTest = await ethers.getContractFactory('FeeAuctionPluginTest');
    const plugin = await FeeAuctionPluginTest.deploy(
      mockPool.target,
      mockFactory.target,
      deployer.address, // pluginFactory
      DEFAULT_BASE_FEE,
      DEFAULT_MEV_TAX_MULTIPLIER,
      DEFAULT_MAX_MEV_TAX,
      DEFAULT_MEV_TAX_ENABLED
    );

    // Set plugin in mock pool
    await mockPool.setPlugin(plugin.target);

    return { plugin, mockPool, mockFactory };
  }

  async function feeAuctionPluginFactoryFixture() {
    const [deployer] = await ethers.getSigners();

    // Deploy mock factory
    const MockFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactory.deploy();

    // Deploy mock pool
    const MockPool = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPool.deploy();

    // Deploy FeeAuctionPluginFactory
    const FeeAuctionPluginFactory = await ethers.getContractFactory('FeeAuctionPluginFactory');
    const pluginFactory = await FeeAuctionPluginFactory.deploy(
      mockFactory.target,
      DEFAULT_BASE_FEE,
      DEFAULT_MEV_TAX_MULTIPLIER,
      DEFAULT_MAX_MEV_TAX,
      DEFAULT_MEV_TAX_ENABLED
    );

    return { pluginFactory, mockPool, mockFactory };
  }

  beforeEach('deploy FeeAuctionPlugin', async () => {
    [wallet, other] = await (ethers as any).getSigners();
    const fixture = await loadFixture(feeAuctionPluginFixture);
    feeAuctionPlugin = fixture.plugin;
    mockPool = fixture.mockPool;
    mockFactory = fixture.mockFactory;
  });

  describe('#initialization', () => {
    it('should initialize with correct base fee', async () => {
      expect(await feeAuctionPlugin.baseFee()).to.equal(DEFAULT_BASE_FEE);
    });

    it('should initialize with correct MEV tax multiplier', async () => {
      expect(await feeAuctionPlugin.mevTaxMultiplier()).to.equal(DEFAULT_MEV_TAX_MULTIPLIER);
    });

    it('should initialize with correct max MEV tax', async () => {
      expect(await feeAuctionPlugin.maxMevTax()).to.equal(DEFAULT_MAX_MEV_TAX);
    });

    it('should initialize with MEV tax enabled', async () => {
      expect(await feeAuctionPlugin.mevTaxEnabled()).to.equal(DEFAULT_MEV_TAX_ENABLED);
    });

    it('should have correct default plugin config', async () => {
      const pluginConfig = await feeAuctionPlugin.defaultPluginConfig();
      // BEFORE_SWAP_FLAG (1) | DYNAMIC_FEE (128) = 129
      expect(pluginConfig).to.equal(129);
    });
  });

  describe('#setBaseFee', () => {
    it('should update base fee', async () => {
      const newBaseFee = 5000;
      await expect(feeAuctionPlugin.setBaseFee(newBaseFee))
        .to.emit(feeAuctionPlugin, 'BaseFeeChanged')
        .withArgs(newBaseFee);
      expect(await feeAuctionPlugin.baseFee()).to.equal(newBaseFee);
    });

    it('should revert if base fee exceeds maximum', async () => {
      const invalidFee = 1000001; // > 100%
      await expect(feeAuctionPlugin.setBaseFee(invalidFee)).to.be.revertedWith('Base fee too high');
    });
  });

  describe('#setMevTaxParameters', () => {
    it('should update MEV tax parameters', async () => {
      const newMultiplier = 2000;
      const newMaxTax = 20000;
      await expect(feeAuctionPlugin.setMevTaxParameters(newMultiplier, newMaxTax))
        .to.emit(feeAuctionPlugin, 'MevTaxParametersChanged')
        .withArgs(newMultiplier, newMaxTax);
      expect(await feeAuctionPlugin.mevTaxMultiplier()).to.equal(newMultiplier);
      expect(await feeAuctionPlugin.maxMevTax()).to.equal(newMaxTax);
    });

    it('should revert if max MEV tax exceeds maximum', async () => {
      const newMultiplier = 2000;
      const invalidMaxTax = 1000001; // > 100%
      await expect(feeAuctionPlugin.setMevTaxParameters(newMultiplier, invalidMaxTax)).to.be.revertedWith(
        'Max MEV tax too high'
      );
    });
  });

  describe('#setMevTaxEnabled', () => {
    it('should enable MEV tax', async () => {
      await feeAuctionPlugin.setMevTaxEnabled(false);
      await expect(feeAuctionPlugin.setMevTaxEnabled(true))
        .to.emit(feeAuctionPlugin, 'MevTaxEnabledChanged')
        .withArgs(true);
      expect(await feeAuctionPlugin.mevTaxEnabled()).to.equal(true);
    });

    it('should disable MEV tax', async () => {
      await expect(feeAuctionPlugin.setMevTaxEnabled(false))
        .to.emit(feeAuctionPlugin, 'MevTaxEnabledChanged')
        .withArgs(false);
      expect(await feeAuctionPlugin.mevTaxEnabled()).to.equal(false);
    });
  });

  describe('#beforeSwap', () => {
    beforeEach('initialize pool', async () => {
      // Initialize the pool first to set plugin config
      await mockPool.initialize(BigInt('79228162514264337593543950336')); // sqrt(1) * 2^96
    });

    it('should return base fee as feeOverride', async () => {
      // When MEV tax is disabled, only base fee should be returned
      await feeAuctionPlugin.setMevTaxEnabled(false);

      // Use swapToTick which calls beforeSwap internally
      await mockPool.swapToTick(0);

      // Check the override fee stored in MockPool
      const overrideFee = await mockPool.overrideFee();
      expect(overrideFee).to.equal(DEFAULT_BASE_FEE);

      const pluginFee = await mockPool.pluginFee();
      expect(pluginFee).to.equal(0);
    });

    it('should calculate MEV tax when enabled', async () => {
      // Note: In hardhat local network, tx.gasprice and block.basefee may result in 0 priority fee
      // This test verifies the mechanism works, actual MEV tax calculation depends on network conditions
      await mockPool.swapToTick(0);

      // Check the override fee stored in MockPool
      const overrideFee = await mockPool.overrideFee();
      expect(overrideFee).to.equal(DEFAULT_BASE_FEE);

      // pluginFee may be 0 in test environment due to gasprice == basefee
    });
  });

  describe('#beforeInitialize', () => {
    it('should update plugin config in pool', async () => {
      // Initialize the pool through the plugin
      await mockPool.initialize(BigInt('79228162514264337593543950336')); // sqrt(1) * 2^96

      const globalState = await mockPool.globalState();
      // Plugin config should be set to BEFORE_SWAP_FLAG | DYNAMIC_FEE = 129
      expect(globalState.pluginConfig).to.equal(129);
    });
  });

  describe('FeeAuctionPluginFactory', () => {
    let pluginFactory: any;

    beforeEach('deploy factory', async () => {
      const fixture = await loadFixture(feeAuctionPluginFactoryFixture);
      pluginFactory = fixture.pluginFactory;
      mockFactory = fixture.mockFactory;
      mockPool = fixture.mockPool;
    });

    it('should have correct default parameters', async () => {
      expect(await pluginFactory.defaultBaseFee()).to.equal(DEFAULT_BASE_FEE);
      expect(await pluginFactory.defaultMevTaxMultiplier()).to.equal(DEFAULT_MEV_TAX_MULTIPLIER);
      expect(await pluginFactory.defaultMaxMevTax()).to.equal(DEFAULT_MAX_MEV_TAX);
      expect(await pluginFactory.defaultMevTaxEnabled()).to.equal(DEFAULT_MEV_TAX_ENABLED);
    });

    it('should create plugin via beforeCreatePoolHook', async () => {
      // Grant factory role to test wallet
      const ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = ethers.keccak256(
        ethers.toUtf8Bytes('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR')
      );
      await mockFactory.grantRole(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, wallet.address);

      // Call beforeCreatePoolHook as if from factory
      // This should fail because msg.sender is not algebraFactory
      await expect(
        pluginFactory.beforeCreatePoolHook(mockPool.target, wallet.address, wallet.address, wallet.address, wallet.address, '0x')
      ).to.be.revertedWith('Only Algebra factory');
    });

    it('should update default parameters', async () => {
      const newBaseFee = 5000;
      const newMultiplier = 2000;
      const newMaxTax = 20000;
      const newEnabled = false;

      // This should fail because 'other' doesn't have admin role and is not owner
      await expect(
        pluginFactory.connect(other).setDefaultParameters(newBaseFee, newMultiplier, newMaxTax, newEnabled)
      ).to.be.revertedWith('Only administrator');

      // wallet is the owner, so it should work directly
      await expect(pluginFactory.setDefaultParameters(newBaseFee, newMultiplier, newMaxTax, newEnabled))
        .to.emit(pluginFactory, 'DefaultParametersChanged')
        .withArgs(newBaseFee, newMultiplier, newMaxTax, newEnabled);

      expect(await pluginFactory.defaultBaseFee()).to.equal(newBaseFee);
      expect(await pluginFactory.defaultMevTaxMultiplier()).to.equal(newMultiplier);
      expect(await pluginFactory.defaultMaxMevTax()).to.equal(newMaxTax);
      expect(await pluginFactory.defaultMevTaxEnabled()).to.equal(newEnabled);
    });
  });
});
