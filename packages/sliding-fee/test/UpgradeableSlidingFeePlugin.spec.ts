import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployBeaconPluginFixture, deployMockPool } from 'test-utils/beaconPlugin';

describe('UpgradeableSlidingFeePlugin', function () {
  const DEFAULT_BASE_FEE = 3000;

  async function deployFixture() {
    return deployBeaconPluginFixture({
      pluginContract: 'UpgradeableSlidingFeePluginTest',
      setup: async ({ mockPool }) => {
        const slidingFeeImpl = await (await ethers.getContractFactory('SlidingFeePluginImplementation')).deploy();

        return {
          pluginArgs: [slidingFeeImpl.target],
          initArgs: [mockPool.target, DEFAULT_BASE_FEE],
          extra: { slidingFeeImpl }
        };
      }
    });
  }
  describe('Initialization', function () {
    it('should initialize with correct values', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      expect(await plugin1.pool()).to.equal(mockPool.target);
      expect(await plugin1.baseFee()).to.equal(DEFAULT_BASE_FEE);
    });

    it('should have Sliding Fee Plugin in active modules', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const modules = await plugin1.getActiveModuleNames();
      expect(modules[0]).to.equal('Sliding Fee Plugin');
    });

    it('should not allow double initialization', async function () {
      const { plugin1, mockPool } = await loadFixture(deployFixture);

      await expect(
        plugin1.initialize(mockPool.target, DEFAULT_BASE_FEE)
      ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should set correct default plugin config', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      // BEFORE_SWAP_FLAG | DYNAMIC_FEE = 1 | 128 = 129
      const BEFORE_SWAP_FLAG = 1n;
      const DYNAMIC_FEE = 1n << 7n;
      const expectedConfig = BEFORE_SWAP_FLAG | DYNAMIC_FEE;
      
      const config = await plugin1.defaultPluginConfig();
      expect(config).to.equal(expectedConfig);
    });

    it('should initialize with default price change factor', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      expect(await plugin1.priceChangeFactor()).to.equal(1000);
    });

    it('should initialize with correct fee factors', async function () {
      const { plugin1 } = await loadFixture(deployFixture);

      const [zeroToOneFactor, oneToZeroFactor] = await plugin1.feeFactors();
      // Initial factors should be 1 << 96
      const expectedFactor = 1n << 96n;
      expect(zeroToOneFactor).to.equal(expectedFactor);
      expect(oneToZeroFactor).to.equal(expectedFactor);
    });
  });

  describe('Fee Configuration', function () {
    it('should allow manager to set base fee', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      const newBaseFee = 5000;

      await expect(plugin1.connect(manager).setBaseFee(newBaseFee))
        .to.emit(plugin1, 'BaseFee')
        .withArgs(newBaseFee);

      expect(await plugin1.baseFee()).to.equal(newBaseFee);
    });

    it('should allow manager to set price change factor', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);
      const newFactor = 500;

      await expect(plugin1.connect(manager).setPriceChangeFactor(newFactor))
        .to.emit(plugin1, 'PriceChangeFactor')
        .withArgs(newFactor);

      expect(await plugin1.priceChangeFactor()).to.equal(newFactor);
    });

    it('should not allow non-manager to set base fee', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setBaseFee(5000)
      ).to.be.revertedWith('Not authorized');
    });

    it('should not allow non-manager to set price change factor', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setPriceChangeFactor(500)
      ).to.be.revertedWith('Not authorized');
    });
  });

  describe('Storage Isolation', function () {
    it('should maintain separate storage for each proxy', async function () {
      const {
        deployProxy,
        beacon,
        pluginImplementation,
        plugin1,
        mockPool,
        PluginContract,
        manager,
        proxyDeployer,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second proxy with different base fee
      const differentBaseFee = 5000;
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, differentBaseFee]);

      // Verify different values
      expect(await plugin1.baseFee()).to.equal(DEFAULT_BASE_FEE);
      expect(await plugin2.baseFee()).to.equal(differentBaseFee);

      // Change base fee in plugin1, verify plugin2 unchanged
      await plugin1.connect(manager).setBaseFee(1000);
      expect(await plugin1.baseFee()).to.equal(1000);
      expect(await plugin2.baseFee()).to.equal(differentBaseFee);
    });
  });

  describe('Immutables Shared', function () {
    it('should share immutable factory addresses across proxies', async function () {
      const {
        deployProxy,
        beacon,
        mockFactory,
        proxyDeployer,
        pluginImplementation,
        plugin1,
        PluginContract,
      } = await loadFixture(deployFixture);

      // Deploy second MockPool
      const mockPool2 = await deployMockPool();

      // Deploy second proxy
      const plugin2 = await deployProxy(mockPool2, [mockPool2.target, 5000]);

      // Both should have same factory addresses (immutables from implementation)
      expect(await plugin1.factory()).to.equal(mockFactory.target);
      expect(await plugin2.factory()).to.equal(mockFactory.target);

      expect(await plugin1.pluginFactory()).to.equal(proxyDeployer.target);
      expect(await plugin2.pluginFactory()).to.equal(proxyDeployer.target);
    });
  });

  describe('Authorization', function () {
    it('should allow owner to call authorized functions', async function () {
      const { plugin1, owner } = await loadFixture(deployFixture);

      // Owner should be able to set base fee
      await expect(plugin1.connect(owner).setBaseFee(5000))
        .to.emit(plugin1, 'BaseFee');
    });

    it('should allow ALGEBRA_BASE_PLUGIN_MANAGER role to call authorized functions', async function () {
      const { plugin1, manager } = await loadFixture(deployFixture);

      await expect(plugin1.connect(manager).setBaseFee(5000))
        .to.emit(plugin1, 'BaseFee');
    });

    it('should reject unauthorized users', async function () {
      const { plugin1, user } = await loadFixture(deployFixture);

      await expect(
        plugin1.connect(user).setBaseFee(5000)
      ).to.be.revertedWith('Not authorized');
    });
  });
});
