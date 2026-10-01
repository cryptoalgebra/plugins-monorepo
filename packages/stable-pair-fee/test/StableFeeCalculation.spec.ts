import { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import * as fs from 'fs';
import * as path from 'path';

// Vectors from Uniswap v4-hooks-public test/stable/data, generated from their fee spreadsheet
// Columns: priceE5,closeFeeE12,farFeeE12,targetFeeE12,block1..block1000
const CSV_PATH = path.join(__dirname, 'data', 'fee_calculation_test_data.csv');
const CSV_BLOCKS = [1n, 2n, 3n, 4n, 5n, 10n, 20n, 50n, 100n, 200n, 500n, 750n, 1000n];

const Q96 = 2n ** 96n;
const OPTIMAL_FEE_E6 = 90n;
// floor(0.99 * 2^24)
const K_Q24 = 16_609_443n;
// 1.5e-8 absolute, same as the Uniswap spreadsheet test
const TOLERANCE_E12 = 15_000n;

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

function readCsvRows(): bigint[][] {
  return fs
    .readFileSync(CSV_PATH, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => line.split(',').map((v) => BigInt(v)));
}

function expectClose(actual: bigint, expected: bigint, label: string) {
  const diff = actual > expected ? actual - expected : expected - actual;
  expect(diff <= TOLERANCE_E12, `${label}: got ${actual}, expected ${expected}`).to.be.true;
}

describe('StableFeeCalculation', function () {
  async function deployFixture() {
    const StableFeeCalculationTest = await ethers.getContractFactory('StableFeeCalculationTest');
    const calc = await StableFeeCalculationTest.deploy();
    return { calc };
  }

  async function computePriceData(calc: any, priceE5: bigint) {
    const sqrtAmmPriceX96 = sqrtBigInt((Q96 * Q96 * priceE5) / 100_000n);
    const priceRatioX96: bigint = await calc.calculatePriceRatioX96(sqrtAmmPriceX96, Q96);
    const closeFeeE12: bigint = await calc.calculateCloseBoundaryFee(priceRatioX96, OPTIMAL_FEE_E6);
    const farFeeE12: bigint = await calc.calculateFarBoundaryFee(priceRatioX96, OPTIMAL_FEE_E6);
    // All CSV prices are outside the optimal range, targetMultiplier is 50
    const targetFeeE12 = farFeeE12 - closeFeeE12 / 2n;
    return { closeFeeE12, farFeeE12, targetFeeE12 };
  }

  describe('Spreadsheet vectors', function () {
    it('should match close, far and target fees', async function () {
      const { calc } = await loadFixture(deployFixture);
      const rows = readCsvRows();
      expect(rows.length).to.be.greaterThan(0);

      for (const row of rows) {
        const { closeFeeE12, farFeeE12, targetFeeE12 } = await computePriceData(calc, row[0]);
        expectClose(closeFeeE12, row[1], `closeFee @ ${row[0]}`);
        expectClose(farFeeE12, row[2], `farFee @ ${row[0]}`);
        expectClose(targetFeeE12, row[3], `targetFee @ ${row[0]}`);
      }
    });

    it('should match decaying fees for every block count', async function () {
      const { calc } = await loadFixture(deployFixture);
      const rows = readCsvRows();

      for (const row of rows) {
        const { farFeeE12, targetFeeE12 } = await computePriceData(calc, row[0]);
        for (let j = 0; j < CSV_BLOCKS.length; j++) {
          const actual: bigint = await calc.calculateDecayingFee(targetFeeE12, farFeeE12, K_Q24, CSV_BLOCKS[j]);
          expectClose(actual, row[4 + j], `decayingFee @ ${row[0]}, ${CSV_BLOCKS[j]} blocks`);
        }
      }
    });
  });

  describe('toFeeE6', function () {
    it('should keep zero as zero', async function () {
      const { calc } = await loadFixture(deployFixture);
      expect(await calc.toFeeE6(0)).to.equal(0);
    });

    it('should round up to the next pip', async function () {
      const { calc } = await loadFixture(deployFixture);
      expect(await calc.toFeeE6(1)).to.equal(1);
      expect(await calc.toFeeE6(1_000_000)).to.equal(1);
      expect(await calc.toFeeE6(1_000_001)).to.equal(2);
    });

    it('should clamp below 100%', async function () {
      const { calc } = await loadFixture(deployFixture);
      expect(await calc.toFeeE6(999_999_000_000n)).to.equal(999_999);
      expect(await calc.toFeeE6(10n ** 12n)).to.equal(999_999);
      expect(await calc.toFeeE6(10n ** 12n + 1n)).to.equal(999_999);
    });
  });

  describe('Inside optimal range fee', function () {
    it('should charge the optimal fee in both directions at the reference price', async function () {
      const { calc } = await loadFixture(deployFixture);
      const ratio: bigint = await calc.calculatePriceRatioX96(Q96, Q96);
      expect(ratio).to.equal(Q96);
      expect(await calc.calculateInsideOptimalRangeFee(ratio, OPTIMAL_FEE_E6, false, true)).to.equal(OPTIMAL_FEE_E6 * 1_000_000n);
      expect(await calc.calculateInsideOptimalRangeFee(ratio, OPTIMAL_FEE_E6, false, false)).to.equal(OPTIMAL_FEE_E6 * 1_000_000n);
    });
  });

  describe('Decay', function () {
    it('should not decay when no blocks passed', async function () {
      const { calc } = await loadFixture(deployFixture);
      expect(await calc.calculateDecayingFee(100n, 1_000_000n, K_Q24, 0)).to.equal(1_000_000n);
    });

    it('should derive a nonzero logK for any k', async function () {
      const { calc } = await loadFixture(deployFixture);
      for (const k of [1n, 1000n, K_Q24, 2n ** 24n - 1n]) {
        expect(await calc.deriveLogK(k)).to.be.greaterThan(0n);
      }
    });

    it('should never decay slower than exact k^n on the slow path', async function () {
      const { calc } = await loadFixture(deployFixture);
      const previous = 10n ** 12n;
      for (const k of [K_Q24, 16_000_000n, 2n ** 24n - 1n]) {
        for (const n of [5n, 6n, 10n, 50n, 200n]) {
          const actual: bigint = await calc.calculateDecayingFee(0, previous, k, n);
          const exactCeil = (previous * k ** n + 2n ** (24n * n) - 1n) / 2n ** (24n * n);
          expect(actual <= exactCeil, `k=${k} n=${n}: ${actual} > ${exactCeil}`).to.be.true;
        }
      }
    });

    it('should be non-increasing across the fast to slow path switch', async function () {
      const { calc } = await loadFixture(deployFixture);
      for (const k of [K_Q24, 16_000_000n, 2n ** 24n - 1n]) {
        let last: bigint = await calc.calculateDecayingFee(1_000n, 10n ** 12n, k, 0);
        for (let n = 1n; n <= 12n; n++) {
          const current: bigint = await calc.calculateDecayingFee(1_000n, 10n ** 12n, k, n);
          expect(current <= last, `k=${k} n=${n}`).to.be.true;
          last = current;
        }
      }
    });
  });
});
