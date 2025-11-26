// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title VolatilityOracle Plugin Implementation
/// @notice This contract contains state management logic for VolatilityOracle plugin using namespaced storage
/// @dev Called via delegatecall from VolatilityOracleConnector
/// @dev Note: The timepoints array is NOT stored here due to its size and complexity.
/// The main plugin contract maintains the timepoints array directly while using this
/// implementation only for basic state (isInitialized, timepointIndex, lastTimepointTimestamp)
contract VolatilityOraclePluginImplementation {
  /// @dev Storage namespace for VolatilityOracle plugin using ERC-7201
  bytes32 internal constant VOLATILITY_ORACLE_NAMESPACE = keccak256('algebra.storage.volatilityoracle');

  struct VolatilityOracleLayout {
    uint16 timepointIndex;
    uint32 lastTimepointTimestamp;
    bool isInitialized;
  }

  /// @dev Fetch pointer of VolatilityOracle plugin's storage
  function _getVolatilityOracleLayout() internal pure returns (VolatilityOracleLayout storage layout) {
    bytes32 position = VOLATILITY_ORACLE_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize VolatilityOracle plugin state
  /// @dev Called via delegatecall from connector
  function initializeVolatilityOracleState() external {
    // Initial state is already zero-initialized
  }

  /// @notice Set initialized state
  /// @dev Called via delegatecall from connector
  /// @param initialized New initialized state
  function setInitialized(bool initialized) external {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    layout.isInitialized = initialized;
  }

  /// @notice Set timepoint index
  /// @dev Called via delegatecall from connector
  /// @param index New timepoint index
  function setTimepointIndex(uint16 index) external {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    layout.timepointIndex = index;
  }

  /// @notice Set last timepoint timestamp
  /// @dev Called via delegatecall from connector
  /// @param timestamp New timestamp
  function setLastTimepointTimestamp(uint32 timestamp) external {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    layout.lastTimepointTimestamp = timestamp;
  }

  /// @notice Get initialized state
  /// @dev Called via staticcall from connector
  /// @return isInitialized Whether the oracle is initialized
  function getIsInitialized() external view returns (bool) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.isInitialized;
  }

  /// @notice Get timepoint index
  /// @dev Called via staticcall from connector
  /// @return index Current timepoint index
  function getTimepointIndex() external view returns (uint16) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.timepointIndex;
  }

  /// @notice Get last timepoint timestamp
  /// @dev Called via staticcall from connector
  /// @return timestamp Last timepoint timestamp
  function getLastTimepointTimestamp() external view returns (uint32) {
    VolatilityOracleLayout storage layout = _getVolatilityOracleLayout();
    return layout.lastTimepointTimestamp;
  }
}
