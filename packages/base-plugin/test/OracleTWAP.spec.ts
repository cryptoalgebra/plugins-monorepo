import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ContractFactory } from 'ethers';
import { OracleTWAP, MockPool, MockTimeDSFactory, TestERC20 } from '../typechain';
import { tokensFixture } from 'test-utils/externalFixtures';
import { ZERO_ADDRESS } from './shared/fixtures';

describe('OracleTWAP', () => {
  let tokens: TestERC20[];
  let oracleTWAP: OracleTWAP;
  let mockPluginFactory: MockTimeDSFactory;

  const oracleTWAPFixture = async () => {
    const tokensFixtureRes = await tokensFixture();
    tokens = [tokensFixtureRes.token0, tokensFixtureRes.token1];

    const mockPluginFactoryFactory = await ethers.getContractFactory('MockTimeDSFactory');
    const _mockPluginFactory = await mockPluginFactoryFactory.deploy(ZERO_ADDRESS);

    const oracleTWAPFactory = await ethers.getContractFactory('OracleTWAP');
    const _oracleTWAP = await oracleTWAPFactory.deploy(_mockPluginFactory);

    return {
      tokens: tokens as TestERC20[],
      oracleTWAP: _oracleTWAP as any as OracleTWAP,
      mockPluginFactory: _mockPluginFactory as any as MockTimeDSFactory,
    };
  };

  beforeEach('deploy fixture', async () => {
    const fixtures = await loadFixture(oracleTWAPFixture);
    tokens = fixtures.tokens;
    oracleTWAP = fixtures.oracleTWAP;
    mockPluginFactory = fixtures.mockPluginFactory;
  });

  it('has correct pluginFactory', async () => {
    expect(await oracleTWAP.pluginFactory()).to.be.eq(await mockPluginFactory.getAddress());
  });

  describe('#getAverageTick', () => {
    let mockVolatilityOracleFactory: ContractFactory;
    let mockPool: MockPool;

    beforeEach('create mockVolatilityOracleFactory', async () => {
      mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      mockPool = (await mockPoolFactory.deploy()) as any as MockPool;
    });

    it('reverts if oracle not exist', async () => {
      await expect(oracleTWAP.getAverageTick(ZERO_ADDRESS, 0)).to.be.revertedWith('Oracle does not exist');
    });

    describe('plugin connected', async () => {
      it('correct output when tick is 0', async () => {
        const period = 3;
        const tickCumulatives = [12n, 12n];
        const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
        await mockPluginFactory.setPluginForPool(mockPool, mockVolatilityOracle);

        await mockPool.setPlugin(mockVolatilityOracle);
        await mockPool.setPluginConfig(1);

        const [oracleLibraryTick, isConnected] = await oracleTWAP.getAverageTick(mockPool, period);

        expect(oracleLibraryTick).to.equal(0n);
        expect(isConnected).to.be.true;
      });

      it('correct output for positive tick', async () => {
        const period = 3;
        const tickCumulatives = [7n, 12n];
        const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
        await mockPluginFactory.setPluginForPool(mockPool, mockVolatilityOracle);
        await mockPool.setPlugin(mockVolatilityOracle);
        await mockPool.setPluginConfig(1);

        const [oracleLibraryTick, isConnected] = await oracleTWAP.getAverageTick(mockPool, period);

        // Always round to negative infinity
        // In this case, we don't have do anything
        expect(oracleLibraryTick).to.equal(1n);
        expect(isConnected).to.be.true;
      });
    });

    describe('plugin not connected', async () => {
      it('correct output when tick is 0', async () => {
        const period = 3;
        const tickCumulatives = [12n, 12n];
        const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
        await mockPluginFactory.setPluginForPool(mockPool, mockVolatilityOracle);

        const [oracleLibraryTick, isConnected] = await oracleTWAP.getAverageTick(mockPool, period);

        expect(oracleLibraryTick).to.equal(0n);
        expect(isConnected).to.be.false;
      });

      it('correct output for positive tick', async () => {
        const period = 3;
        const tickCumulatives = [7n, 12n];
        const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
        await mockPluginFactory.setPluginForPool(mockPool, mockVolatilityOracle);

        const [oracleLibraryTick, isConnected] = await oracleTWAP.getAverageTick(mockPool, period);

        // Always round to negative infinity
        // In this case, we don't have do anything
        expect(oracleLibraryTick).to.equal(1n);
        expect(isConnected).to.be.false;
      });
    });
  });

  describe('#getQuoteAtTick', () => {
    it('token0: returns correct value when at min tick | 0 < sqrtRatioX96 <= type(uint128).max', async () => {
      const quoteAmount = await oracleTWAP.getQuoteAtTick(-887272n, 2n ** 128n - 1n, tokens[0], tokens[1]);
      expect(quoteAmount).to.equal(1n);
    });
  });

  describe('#latestTimestamp', () => {
    it('returns correct value', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      const latestTimestamp = await oracleTWAP.latestTimestamp(mockVolatilityOracle);
      expect(latestTimestamp).to.equal(101);
    });
  });

  describe('#oldestTimestamp', () => {
    it('returns correct value without overflow', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 1], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      const oldestTimestamp = await oracleTWAP.oldestTimestamp(mockVolatilityOracle);
      expect(oldestTimestamp).to.be.eq(period);
    });

    it('returns correct value with overflow', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 2], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      await mockVolatilityOracle.setTimepoint(2, true, 1000, 10, 20);
      const oldestTimestamp = await oracleTWAP.oldestTimestamp(mockVolatilityOracle);
      expect(oldestTimestamp).to.be.eq(1000);
    });
  });

  describe('#latestIndex', () => {
    it('returns correct value', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      const latestIndex = await oracleTWAP.latestIndex(mockVolatilityOracle);
      expect(latestIndex).to.equal(1);
    });
  });

  describe('#isOracleConnected', () => {
    it('returns correct value', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);

      const mockPoolFactory = await ethers.getContractFactory('MockPool');
      const mockPool = await mockPoolFactory.deploy();

      await mockPluginFactory.setPluginForPool(mockPool, mockVolatilityOracle);

      expect(await oracleTWAP.isOracleConnected(mockPool)).to.be.false;

      await mockPool.setPlugin(mockVolatilityOracle);
      expect(await oracleTWAP.isOracleConnected(mockPool)).to.be.false;

      await mockPool.setPluginConfig(1);
      expect(await oracleTWAP.isOracleConnected(mockPool)).to.be.true;
    });
  });

  describe('#oldestIndex', () => {
    it('returns correct value without overflow', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      const oldestIndex = await oracleTWAP.oldestIndex(mockVolatilityOracle);
      expect(oldestIndex).to.be.eq(0);
    });

    it('returns correct value with overflow', async () => {
      const period = 3;
      const tickCumulatives = [7n, 12n];
      const mockVolatilityOracleFactory = await ethers.getContractFactory('MockVolatilityOracle');
      const mockVolatilityOracle = await mockVolatilityOracleFactory.deploy([period, 0], tickCumulatives);
      await mockPluginFactory.setPluginForPool(mockVolatilityOracle, mockVolatilityOracle);

      await mockVolatilityOracle.setTimepoint(2, true, 1, 10, 20);
      const oldestTimestamp = await oracleTWAP.oldestIndex(mockVolatilityOracle);
      expect(oldestTimestamp).to.be.eq(2);
    });
  });
});
