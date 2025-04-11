// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.8.20;
pragma abicoder v1;

import '../interfaces/IAlgebraBasePluginFactory.sol';
import '../interfaces/IOracleTWAP.sol';

import '@cryptoalgebra/volatility-oracle-plugin/contracts/interfaces/IVolatilityOracle.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/libraries/VolatilityOracleInteractions.sol';

/// @title Algebra Integral 1.2.1 TWAP oracle
/// @notice Provides data from oracle corresponding pool
/// @dev These functions are not very gas efficient and it is better not to use them on-chain
/// @dev Integrates with Volatility Oracle plugin
contract OracleTWAP is IOracleTWAP {
  /// @inheritdoc IOracleTWAP
  address public immutable override pluginFactory;

  constructor(address _pluginFactory) {
    pluginFactory = _pluginFactory;
  }

  /// @inheritdoc IOracleTWAP
  function getQuoteAtTick(
    int24 tick,
    uint128 baseAmount,
    address baseToken,
    address quoteToken
  ) external pure override returns (uint256 quoteAmount) {
    return VolatilityOracleInteractions.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
  }

  /// @inheritdoc IOracleTWAP
  function getAverageTick(address pool, uint32 period) external view override returns (int24 timeWeightedAverageTick, bool isConnected) {
    address oracleAddress = _getPluginForPool(pool);
    timeWeightedAverageTick = VolatilityOracleInteractions.consult(oracleAddress, period);
    isConnected = VolatilityOracleInteractions.isOracleConnectedToPool(oracleAddress, pool);
  }

  /// @inheritdoc IOracleTWAP
  function latestTimestamp(address pool) external view override returns (uint32) {
    return IVolatilityOracle(_getPluginForPool(pool)).lastTimepointTimestamp();
  }

  /// @inheritdoc IOracleTWAP
  function oldestTimestamp(address pool) external view override returns (uint32 _oldestTimestamp) {
    address oracle = _getPluginForPool(pool);
    (, _oldestTimestamp) = VolatilityOracleInteractions.oldestTimepointMetadata(oracle);
  }

  /// @inheritdoc IOracleTWAP
  function latestIndex(address pool) external view override returns (uint16) {
    return VolatilityOracleInteractions.latestIndex(_getPluginForPool(pool));
  }

  /// @inheritdoc IOracleTWAP
  function isOracleConnected(address pool) external view override returns (bool connected) {
    connected = VolatilityOracleInteractions.isOracleConnectedToPool(_getPluginForPool(pool), pool);
  }

  /// @inheritdoc IOracleTWAP
  function oldestIndex(address pool) external view override returns (uint16 _oldestIndex) {
    address oracle = _getPluginForPool(pool);
    (_oldestIndex, ) = VolatilityOracleInteractions.oldestTimepointMetadata(oracle);
  }

  function _getPluginForPool(address pool) internal view returns (address) {
    address pluginAddress = IAlgebraBasePluginFactory(pluginFactory).pluginByPool(pool);
    require(pluginAddress != address(0), 'Oracle does not exist');
    return pluginAddress;
  }
}
