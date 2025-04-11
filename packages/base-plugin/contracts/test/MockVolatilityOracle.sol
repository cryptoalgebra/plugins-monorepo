// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import { MockVolatilityOracle } from '@cryptoalgebra/volatility-oracle-plugin/contracts/test/MockVolatilityOracle.sol';

// @dev Used just to access MockVolatilityOracle in artifacts
contract Importer is MockVolatilityOracle {
  constructor(uint32[] memory secondsAgos, int56[] memory tickCumulatives)
    MockVolatilityOracle(secondsAgos, tickCumulatives) {}
}
