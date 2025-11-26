// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title VolatilityOracle Connector
/// @notice This contract provides delegatecall interface to VolatilityOracle plugin implementation
/// @dev Note: The timepoints array must remain in the main contract storage for proper operation
/// This connector only handles initialization and configuration, not the timepoints array
abstract contract VolatilityOracleConnector {
  using Plugins for uint8;

  uint8 internal constant VOLATILITY_ORACLE_PLUGIN_CONFIG = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable volatilityOracleImplementation;

  constructor(address _volatilityOracleImplementation) {
    volatilityOracleImplementation = _volatilityOracleImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateVolatilityOracleRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('VolatilityOracle: delegatecall failed');
  }

  /// @notice Initialize VolatilityOracle plugin state via delegatecall
  function _initializeVolatilityOracleState() internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeVolatilityOracleState()');
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.delegatecall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
    
    return VOLATILITY_ORACLE_PLUGIN_CONFIG;
  }

  /// @notice Set initialized state via delegatecall
  function _setInitialized(bool initialized) internal {
    bytes memory data = abi.encodeWithSignature('setInitialized(bool)', initialized);
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.delegatecall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
  }

  /// @notice Set timepoint index via delegatecall
  function _setTimepointIndex(uint16 index) internal {
    bytes memory data = abi.encodeWithSignature('setTimepointIndex(uint16)', index);
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.delegatecall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
  }

  /// @notice Set last timepoint timestamp via delegatecall
  function _setLastTimepointTimestamp(uint32 timestamp) internal {
    bytes memory data = abi.encodeWithSignature('setLastTimepointTimestamp(uint32)', timestamp);
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.delegatecall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
  }

  /// @notice Get initialized state via staticcall
  function _getIsInitialized() internal view returns (bool) {
    bytes memory data = abi.encodeWithSignature('getIsInitialized()');
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.staticcall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
    
    return abi.decode(returnData, (bool));
  }

  /// @notice Get timepoint index via staticcall
  function _getTimepointIndex() internal view returns (uint16) {
    bytes memory data = abi.encodeWithSignature('getTimepointIndex()');
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.staticcall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
    
    return abi.decode(returnData, (uint16));
  }

  /// @notice Get last timepoint timestamp via staticcall
  function _getLastTimepointTimestamp() internal view returns (uint32) {
    bytes memory data = abi.encodeWithSignature('getLastTimepointTimestamp()');
    
    (bool success, bytes memory returnData) = volatilityOracleImplementation.staticcall(data);
    if (!success) _propagateVolatilityOracleRevert(returnData);
    
    return abi.decode(returnData, (uint32));
  }
}
