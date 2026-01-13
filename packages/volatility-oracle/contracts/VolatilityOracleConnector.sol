// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './libraries/VolatilityOracle.sol';
import './libraries/VolatilityOracleStorage.sol';
import './interfaces/IVolatilityOracle.sol';
import './interfaces/IVolatilityOraclePluginImplementation.sol';

/// @title VolatilityOracle Connector
/// @notice This contract provides delegatecall interface to VolatilityOracle plugin implementation
abstract contract VolatilityOracleConnector is BaseConnector, IVolatilityOracle {
  using Plugins for uint8;
  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  string internal constant VOLATILITY_ORACLE_MODULE_NAME = 'Volatility Oracle Plugin';
  uint8 internal constant VOLATILITY_ORACLE_PLUGIN_CONFIG = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  /// @dev changes only on full plugin upgrade
  address internal immutable volatilityOracleImplementation;

  constructor(address _volatilityOracleImplementation) {
    volatilityOracleImplementation = _volatilityOracleImplementation;
  }

  function _initialize_TWAP(int24 tick) internal {
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.initializeTWAP, (_blockTimestamp(), tick))
    );
  }

  /// @dev Get pool state - must be implemented by inheriting contract
  function _getPoolState() internal view virtual returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig);

  /// @dev Get block timestamp - must be implemented by inheriting contract
  function _blockTimestamp() internal view virtual returns (uint32);

  function _writeTimepoint() internal {
    (, int24 tick, , ) = _getPoolState();
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.writeTimepoint, (_blockTimestamp(), tick))
    );
  }

  // ============ TWAP Tick Calculation for ALM ============

  /// @notice Get TWAP tick for a given period via delegatecall
  /// @param period Number of seconds in the past to start calculating time-weighted average
  /// @return timeWeightedAverageTick The time-weighted average tick
  function _getTwapTick(uint32 period) internal returns (int24 timeWeightedAverageTick) {
    (, int24 tick, , ) = _getPoolState();
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getTwapTick, (period, tick, _blockTimestamp()))
    );
    return abi.decode(returnData, (int24));
  }

  /// @notice Check if we can get timepoints for a given period
  /// @param period The period in seconds
  /// @return True if timepoints are available for the period
  function _canGetTwap(uint32 period) internal returns (bool) {
    (bool success, bytes memory returnData) = volatilityOracleImplementation.delegatecall(
      abi.encodeCall(IVolatilityOraclePluginImplementation.canGetTwap, (period, _blockTimestamp()))
    );
    if (!success) return false;
    return abi.decode(returnData, (bool));
  }

  // ============ View Methods (Direct Storage Access) ============
  // These methods read directly from namespaced storage for view compatibility

  /// @notice Get average volatility (view version)
  function _getAverageVolatilityLast() internal view returns (uint88 volatilityAverage) {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    (, int24 tick, , ) = _getPoolState();
    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    return layout.timepoints.getAverageVolatility(_blockTimestamp(), tick, lastIndex, oldestIndex);
  }

  // ============ IVolatilityOracle Public Interface ============

  /// @inheritdoc IVolatilityOracle
  function timepoints(
    uint256 index
  )
    external
    view
    override
    returns (
      bool initialized,
      uint32 blockTimestamp,
      int56 tickCumulative,
      uint88 volatilityCumulative,
      int24 tick,
      int24 averageTick,
      uint16 windowStartIndex
    )
  {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    VolatilityOracle.Timepoint storage tp = layout.timepoints[index];
    return (tp.initialized, tp.blockTimestamp, tp.tickCumulative, tp.volatilityCumulative, tp.tick, tp.averageTick, tp.windowStartIndex);
  }

  /// @inheritdoc IVolatilityOracle
  function timepointIndex() external view override returns (uint16) {
    return VolatilityOracleStorage.layout().timepointIndex;
  }

  /// @inheritdoc IVolatilityOracle
  function initialize() external override {
    require(!VolatilityOracleStorage.layout().isInitialized, 'Already initialized');
    (uint160 price, int24 tick, , ) = _getPoolState();
    require(price != 0, 'Pool is not initialized');
    _initialize_TWAP(tick);
  }

  /// @inheritdoc IVolatilityOracle
  function lastTimepointTimestamp() public view override returns (uint32) {
    return VolatilityOracleStorage.layout().lastTimepointTimestamp;
  }

  /// @inheritdoc IVolatilityOracle
  function isInitialized() external view override returns (bool) {
    return VolatilityOracleStorage.layout().isInitialized;
  }

  /// @inheritdoc IVolatilityOracle
  function getSingleTimepoint(uint32 secondsAgo) external view override returns (int56 tickCumulative, uint88 volatilityCumulative) {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    (, int24 tick, , ) = _getPoolState();
    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    VolatilityOracle.Timepoint memory result = layout.timepoints.getSingleTimepoint(
      _blockTimestamp(),
      secondsAgo,
      tick,
      lastIndex,
      oldestIndex
    );

    return (result.tickCumulative, result.volatilityCumulative);
  }

  /// @inheritdoc IVolatilityOracle
  function getTimepoints(
    uint32[] memory secondsAgos
  ) external view override returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();
    (, int24 tick, , ) = _getPoolState();
    uint16 lastIndex = layout.timepointIndex;

    return layout.timepoints.getTimepoints(_blockTimestamp(), secondsAgos, tick, lastIndex);
  }

  /// @inheritdoc IVolatilityOracle
  function prepayTimepointsStorageSlots(uint16 startIndex, uint16 amount) external override {
    _authorize();
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.prepayTimepointsSlots, (startIndex, amount))
    );
  }
}
