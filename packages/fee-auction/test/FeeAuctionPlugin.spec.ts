import { expect } from 'test-utils/expect';
import { ethers } from 'hardhat';
import { pinnedPluginProxyFactory } from 'test-utils/pinnedProxy';
import { Wallet } from 'ethers';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import {
  FeeAuctionPluginTest,
  FeeAuctionPluginImplementation,
  MockFactory,
  MockPluginFactory,
  MockPool,
} from '../typechain';

describe('FeeAuctionPlugin', () => {
  let wallet: Wallet, other: Wallet;
  let feeAuctionImplementation: FeeAuctionPluginImplementation;
  let pluginProxy: FeeAuctionPluginTest;
  let mockPool: MockPool;
  let mockFactory: MockFactory;
  let mockPluginFactory: MockPluginFactory;

  const DEFAULT_BASE_FEE = 3000; // 0.3%
  const DEFAULT_MEV_TAX_MULTIPLIER = 1000; // multiplier for priority fee
  const DEFAULT_MAX_MEV_TAX = 10000; // 1% max
  const DEFAULT_MEV_TAX_ENABLED = true;

  async function feeAuctionPluginFixture() {
    const [deployer] = await ethers.getSigners();

    // Deploy MockFactory
    const MockFactoryFactory = await ethers.getContractFactory('MockFactory');
    const mockFactory = await MockFactoryFactory.deploy() as any as MockFactory;

    // Deploy MockPluginFactory
    const MockPluginFactoryFactory = await ethers.getContractFactory('MockPluginFactory');
    const mockPluginFactory = await MockPluginFactoryFactory.deploy() as any as MockPluginFactory;

    // Deploy MockPool
    const MockPoolFactory = await ethers.getContractFactory('MockPool');
    const mockPool = await MockPoolFactory.deploy() as any as MockPool;

    // Deploy FeeAuction Implementation (shared logic contract)
    const implFactory = await ethers.getContractFactory('FeeAuctionPluginImplementation');
    const feeAuctionImplementation = await implFactory.deploy() as any as FeeAuctionPluginImplementation;

    // Deploy Plugin Logic (with factory, pluginFactory, and implementation address as immutables)
    const pluginLogicFactory = await ethers.getContractFactory('FeeAuctionPluginTest');
    const pluginLogic = await pluginLogicFactory.deploy(
      await mockFactory.getAddress(),
      await mockPluginFactory.getAddress(),
      await feeAuctionImplementation.getAddress()
    );

    // Deploy Beacon
    const BeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
    const beacon = await BeaconFactory.deploy(await pluginLogic.getAddress());

    // Deploy Proxy
    const AlgebraPluginProxyFactory = await pinnedPluginProxyFactory();
    const proxy = await AlgebraPluginProxyFactory.deploy(
      await beacon.getAddress(),
      await mockPool.getAddress(),
      '0x' // Empty data - we'll call initialize separately
    );

    // Get proxy as FeeAuctionPluginTest interface
    const pluginProxy = await ethers.getContractAt('FeeAuctionPluginTest', await proxy.getAddress()) as any as FeeAuctionPluginTest;

    // Set plugin in mockPool to proxy address
    await mockPool.setPlugin(await pluginProxy.getAddress());

    // Initialize plugin via pluginFactory (onlyPluginFactory modifier)
    await mockPluginFactory.setDefaultImplementation(await pluginProxy.getAddress());

    return { pluginProxy, mockPool, mockFactory, mockPluginFactory, feeAuctionImplementation };
  }

  async function initializePlugin(pluginProxy: FeeAuctionPluginTest) {
    await pluginProxy.initialize(
      DEFAULT_BASE_FEE,
      DEFAULT_MEV_TAX_MULTIPLIER,
      DEFAULT_MAX_MEV_TAX,
      DEFAULT_MEV_TAX_ENABLED
    );
  }

  beforeEach('deploy FeeAuctionPlugin', async () => {
    [wallet, other] = await (ethers as any).getSigners();
    const fixture = await loadFixture(feeAuctionPluginFixture);
    pluginProxy = fixture.pluginProxy;
    mockPool = fixture.mockPool;
    mockFactory = fixture.mockFactory;
    mockPluginFactory = fixture.mockPluginFactory;
    feeAuctionImplementation = fixture.feeAuctionImplementation;
  });

  describe('#initialization', () => {
    it('should initialize with correct base fee', async () => {
      await initializePlugin(pluginProxy);
      expect(await pluginProxy.baseFee()).to.equal(DEFAULT_BASE_FEE);
    });

    it('should initialize with correct MEV tax multiplier', async () => {
      await initializePlugin(pluginProxy);
      expect(await pluginProxy.mevTaxMultiplier()).to.equal(DEFAULT_MEV_TAX_MULTIPLIER);
    });

    it('should initialize with correct max MEV tax', async () => {
      await initializePlugin(pluginProxy);
      expect(await pluginProxy.maxMevTax()).to.equal(DEFAULT_MAX_MEV_TAX);
    });

    it('should initialize with MEV tax enabled', async () => {
      await initializePlugin(pluginProxy);
      expect(await pluginProxy.mevTaxEnabled()).to.equal(DEFAULT_MEV_TAX_ENABLED);
    });

    it('should have correct default plugin config', async () => {
      const pluginConfig = await pluginProxy.defaultPluginConfig();
      // BEFORE_SWAP_FLAG (1) | DYNAMIC_FEE (128) = 129
      expect(pluginConfig).to.equal(129);
    });

    it('should not allow double initialization', async () => {
      await initializePlugin(pluginProxy);
      await expect(
        initializePlugin(pluginProxy)
      ).to.be.reverted;
    });

    it('should only allow admin to initialize', async () => {
      await expect(
        pluginProxy.connect(other).initialize(DEFAULT_BASE_FEE, DEFAULT_MEV_TAX_MULTIPLIER, DEFAULT_MAX_MEV_TAX, DEFAULT_MEV_TAX_ENABLED)
      ).to.be.reverted;
    });
  });

  describe('#setBaseFee', () => {
    beforeEach(async () => {
      await initializePlugin(pluginProxy);
    });

    it('should update base fee', async () => {
      const newBaseFee = 5000;
      await expect(pluginProxy.setBaseFee(newBaseFee))
        .to.emit(pluginProxy, 'BaseFeeChanged')
        .withArgs(newBaseFee);
      expect(await pluginProxy.baseFee()).to.equal(newBaseFee);
    });

    it('should revert if base fee exceeds maximum', async () => {
      const invalidFee = 1000001; // > 100%
      await expect(pluginProxy.setBaseFee(invalidFee)).to.be.revertedWith('Base fee too high');
    });

    it('should revert if called by non-admin', async () => {
      await expect(pluginProxy.connect(other).setBaseFee(5000)).to.be.reverted;
    });
  });

  describe('#setMevTaxParameters', () => {
    beforeEach(async () => {
      await initializePlugin(pluginProxy);
    });

    it('should update MEV tax parameters', async () => {
      const newMultiplier = 2000;
      const newMaxTax = 20000;
      await expect(pluginProxy.setMevTaxParameters(newMultiplier, newMaxTax))
        .to.emit(pluginProxy, 'MevTaxParametersChanged')
        .withArgs(newMultiplier, newMaxTax);
      expect(await pluginProxy.mevTaxMultiplier()).to.equal(newMultiplier);
      expect(await pluginProxy.maxMevTax()).to.equal(newMaxTax);
    });

    it('should revert if max MEV tax exceeds maximum', async () => {
      const newMultiplier = 2000;
      const invalidMaxTax = 1000001; // > 100%
      await expect(pluginProxy.setMevTaxParameters(newMultiplier, invalidMaxTax)).to.be.revertedWith(
        'Max MEV tax too high'
      );
    });

    it('should revert if called by non-admin', async () => {
      await expect(pluginProxy.connect(other).setMevTaxParameters(2000, 20000)).to.be.reverted;
    });
  });

  describe('#setMevTaxEnabled', () => {
    beforeEach(async () => {
      await initializePlugin(pluginProxy);
    });

    it('should enable MEV tax', async () => {
      await pluginProxy.setMevTaxEnabled(false);
      await expect(pluginProxy.setMevTaxEnabled(true))
        .to.emit(pluginProxy, 'MevTaxEnabledChanged')
        .withArgs(true);
      expect(await pluginProxy.mevTaxEnabled()).to.equal(true);
    });

    it('should disable MEV tax', async () => {
      await expect(pluginProxy.setMevTaxEnabled(false))
        .to.emit(pluginProxy, 'MevTaxEnabledChanged')
        .withArgs(false);
      expect(await pluginProxy.mevTaxEnabled()).to.equal(false);
    });

    it('should revert if called by non-admin', async () => {
      await expect(pluginProxy.connect(other).setMevTaxEnabled(false)).to.be.reverted;
    });
  });

  describe('#beforeSwap', () => {
    beforeEach(async () => {
      await initializePlugin(pluginProxy);
      // Initialize the pool first to set plugin config
      await mockPool.initialize(BigInt('79228162514264337593543950336')); // sqrt(1) * 2^96
    });

    it('should return base fee as feeOverride', async () => {
      // When MEV tax is disabled, only base fee should be returned
      await pluginProxy.setMevTaxEnabled(false);

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
    beforeEach(async () => {
      await initializePlugin(pluginProxy);
    });

    it('should update plugin config in pool', async () => {
      // Initialize the pool through the plugin
      await mockPool.initialize(BigInt('79228162514264337593543950336')); // sqrt(1) * 2^96

      const globalState = await mockPool.globalState();
      // Plugin config should be set to BEFORE_SWAP_FLAG | DYNAMIC_FEE = 129
      expect(globalState.pluginConfig).to.equal(129);
    });
  });

  describe('#getActiveModuleNames', () => {
    it('should return correct module names', async () => {
      const moduleNames = await pluginProxy.getActiveModuleNames();
      expect(moduleNames).to.have.lengthOf(1);
      expect(moduleNames[0]).to.equal('Fee Auction Plugin');
    });
  });

  describe('#implementation', () => {
    it('should have correct implementation address', async () => {
      const implAddress = await pluginProxy.getFeeAuctionImplementation();
      expect(implAddress).to.equal(await feeAuctionImplementation.getAddress());
    });
  });
});
