// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../libraries/VolatilityOracleInteractions.sol';

contract VolatilityOracleInteractionsTest {
  function consult(address oracleAddress, uint32 period) public view returns (int24 timeWeightedAverageTick) {
    timeWeightedAverageTick = VolatilityOracleInteractions.consult(oracleAddress, period);
  }

  function getQuoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken) public pure returns (uint256 quoteAmount) {
    quoteAmount = VolatilityOracleInteractions.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
  }

  function lastTimepointMetadata(address oracleAddress) external view returns (uint16 index, uint32 timestamp) {
    return VolatilityOracleInteractions.lastTimepointMetadata(oracleAddress);
  }

  function oldestTimepointMetadata(address oracleAddress) external view returns (uint16 index, uint32 timestamp) {
    return VolatilityOracleInteractions.oldestTimepointMetadata(oracleAddress);
  }

  function isInitialized(address oracleAddress) external view returns (bool) {
    return VolatilityOracleInteractions.isInitialized(oracleAddress);
  }

  // For gas snapshot test
  function getGasCostOfConsult(address oracleAddress, uint32 period) public view returns (uint256) {
    uint256 gasBefore = gasleft();
    VolatilityOracleInteractions.consult(oracleAddress, period);
    return gasBefore - gasleft();
  }

  function getGasCostOfGetQuoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken) public view returns (uint256) {
    uint256 gasBefore = gasleft();
    VolatilityOracleInteractions.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
    return gasBefore - gasleft();
  }

  function isConnected(address oracleAddress, address poolAddress) external view returns (bool) {
    return VolatilityOracleInteractions.isOracleConnectedToPool(oracleAddress, poolAddress);
  }
}
