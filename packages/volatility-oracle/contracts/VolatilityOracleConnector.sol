// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './libraries/VolatilityOracle.sol';
import './interfaces/IVolatilityOraclePluginImplementation.sol';

/// @title VolatilityOracle Connector
/// @notice This contract provides delegatecall interface to VolatilityOracle plugin implementation
/// @dev All state including the timepoints array is managed via delegatecall to the implementation contract
/// @dev The implementation uses ERC-7201 namespaced storage for collision-free storage access
abstract contract VolatilityOracleConnector is BaseConnector {
  using Plugins for uint8;
  uint256 internal constant UINT16_MODULO = 65536;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  uint8 internal constant VOLATILITY_ORACLE_PLUGIN_CONFIG = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  /// @dev Storage namespace for VolatilityOracle plugin using ERC-7201
  /// @dev Must match the slot in VolatilityOraclePluginImplementation
  bytes32 internal constant VOLATILITY_ORACLE_STORAGE_SLOT = keccak256('algebra.storage.volatilityoracle');

  struct VolatilityOracleLayout {
    uint16 timepointIndex;
    uint32 lastTimepointTimestamp;
    bool isInitialized;
    VolatilityOracle.Timepoint[UINT16_MODULO] timepoints;
  }

  /// @dev Fetch pointer of VolatilityOracle plugin's storage for direct view access
  function _getVolatilityOracleLayout() internal pure returns (VolatilityOracleLayout storage layout) {
    bytes32 position = VOLATILITY_ORACLE_STORAGE_SLOT;
    assembly {
      layout.slot := position
    }
  }

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable volatilityOracleImplementation;

  constructor(address _volatilityOracleImplementation) {
    volatilityOracleImplementation = _volatilityOracleImplementation;
  }

  /// @notice Initialize VolatilityOracle plugin state via delegatecall
  function _initializeVolatilityOracleState() internal returns (uint8) {
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.initializeVolatilityOracleState, ())
    );
    return VOLATILITY_ORACLE_PLUGIN_CONFIG;
  }

  /// @notice Get initialized state via delegatecall
  function _getIsInitialized() internal returns (bool) {
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getIsInitialized, ())
    );
    return abi.decode(returnData, (bool));
  }

  /// @notice Get timepoint index via delegatecall
  function _getTimepointIndex() internal returns (uint16) {
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getTimepointIndex, ())
    );
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get last timepoint timestamp via delegatecall
  function _getLastTimepointTimestamp() internal returns (uint32) {
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getLastTimepointTimestamp, ())
    );
    return abi.decode(returnData, (uint32));
  }

  // ============ Timepoints Array Operations ============

  /// @notice Get a single timepoint by index via delegatecall
  function _getTimepoint(uint16 index) internal returns (VolatilityOracle.Timepoint memory) {
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getTimepoint, (index))
    );
    return abi.decode(returnData, (VolatilityOracle.Timepoint));
  }

  /// @notice Initialize TWAP oracle - single call that initializes timepoints and sets state
  /// @dev Equivalent to the original _initialize_TWAP in VolatilityOraclePlugin
  function _initialize_TWAP(uint32 time, int24 tick) internal {
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.initializeTWAP, (time, tick))
    );
  }

  /// @dev Get pool state - must be implemented by inheriting contract
  function _getPoolState() internal view virtual returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig);

  /// @dev Get block timestamp - must be implemented by inheriting contract
  function _blockTimestamp() internal view virtual returns (uint32);

  /// @notice Write timepoint with automatic state management (simplified version)
  /// @dev Equivalent to the original _writeTimepoint in VolatilityOraclePlugin
  function _writeTimepoint() internal {
    (, int24 tick, , ) = _getPoolState();
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.writeTimepointSimple, (_blockTimestamp(), tick))
    );
  }

  /// @notice Get average volatility using current state (simplified version)
  /// @dev Equivalent to the original _getAverageVolatilityLast in VolatilityOraclePlugin
  function _getAverageVolatilityLast() internal returns (uint88 volatilityAverage) {
    (, int24 tick, , ) = _getPoolState();
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getAverageVolatilityLast, (_blockTimestamp(), tick))
    );
    return abi.decode(returnData, (uint88));
  }

  /// @notice Prepay storage slots for timepoints via delegatecall
  function _prepayTimepointsSlots(uint16 startIndex, uint16 amount) internal {
    _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.prepayTimepointsSlots, (startIndex, amount))
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

  /// @notice Get last block timestamp from oracle state
  /// @return The timestamp of the last recorded timepoint
  function _getOracleLastTimestamp() internal returns (uint32) {
    bytes memory returnData = _delegateCall(
      volatilityOracleImplementation,
      abi.encodeCall(IVolatilityOraclePluginImplementation.getLastTimepointTimestamp, ())
    );
    return abi.decode(returnData, (uint32));
  }

  // ============ View Methods (Direct Storage Access) ============
  // These methods read directly from namespaced storage for view compatibility

  /// @notice Get initialized state (view)
  function _getIsInitializedView() internal view returns (bool) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.isInitialized;
  }

  /// @notice Get timepoint index (view)
  function _getTimepointIndexView() internal view returns (uint16) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.timepointIndex;
  }

  /// @notice Get last timepoint timestamp (view)
  function _getLastTimepointTimestampView() internal view returns (uint32) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.lastTimepointTimestamp;
  }

  /// @notice Get a single timepoint by index (view)
  function _getTimepointView(
    uint16 index
  )
    internal
    view
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
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    VolatilityOracle.Timepoint storage tp = layout.timepoints[index];
    return (
      tp.initialized,
      tp.blockTimestamp,
      tp.tickCumulative,
      tp.volatilityCumulative,
      tp.tick,
      tp.averageTick,
      tp.windowStartIndex
    );
  }

  /// @notice Get average volatility (view version)
  function _getAverageVolatilityLastView() internal view returns (uint88 volatilityAverage) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    (, int24 tick, , ) = _getPoolState();
    uint16 lastIndex = layout.timepointIndex;
    uint16 oldestIndex = layout.timepoints.getOldestIndex(lastIndex);

    return layout.timepoints.getAverageVolatility(_blockTimestamp(), tick, lastIndex, oldestIndex);
  }

  /// @notice Get single timepoint data (view version)
  function _getSingleTimepointView(
    uint32 secondsAgo
  ) internal view returns (int56 tickCumulative, uint88 volatilityCumulative) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
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

  /// @notice Get multiple timepoints (view version)
  function _getTimepointsView(
    uint32[] memory secondsAgos
  ) internal view returns (int56[] memory tickCumulatives, uint88[] memory volatilityCumulatives) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    (, int24 tick, , ) = _getPoolState();
    uint16 lastIndex = layout.timepointIndex;

    return layout.timepoints.getTimepoints(_blockTimestamp(), secondsAgos, tick, lastIndex);
  }
}
