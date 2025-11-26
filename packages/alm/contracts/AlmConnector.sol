// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

/// @title ALM Connector
/// @notice This contract provides delegatecall interface to ALM plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract AlmConnector {
  using Plugins for uint8;

  uint8 internal constant ALM_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable almImplementation;

  constructor(address _almImplementation) {
    almImplementation = _almImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateAlmRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('ALM: delegatecall failed');
  }

  /// @notice Initialize ALM plugin via delegatecall
  function _initializeAlm(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature(
      'initializeALM(address,uint32,uint32)',
      _rebalanceManager,
      _slowTwapPeriod,
      _fastTwapPeriod
    );
    
    (bool success, bytes memory returnData) = almImplementation.delegatecall(data);
    if (!success) _propagateAlmRevert(returnData);
    
    return ALM_PLUGIN_CONFIG;
  }

  /// @notice Set slow TWAP period via delegatecall
  function _setSlowTwapPeriod(uint32 _slowTwapPeriod) internal {
    bytes memory data = abi.encodeWithSignature('setSlowTwapPeriod(uint32)', _slowTwapPeriod);
    
    (bool success, bytes memory returnData) = almImplementation.delegatecall(data);
    if (!success) _propagateAlmRevert(returnData);
  }

  /// @notice Set fast TWAP period via delegatecall
  function _setFastTwapPeriod(uint32 _fastTwapPeriod) internal {
    bytes memory data = abi.encodeWithSignature('setFastTwapPeriod(uint32)', _fastTwapPeriod);
    
    (bool success, bytes memory returnData) = almImplementation.delegatecall(data);
    if (!success) _propagateAlmRevert(returnData);
  }

  /// @notice Set rebalance manager via delegatecall
  function _setRebalanceManager(address _rebalanceManager) internal {
    bytes memory data = abi.encodeWithSignature('setRebalanceManager(address)', _rebalanceManager);
    
    (bool success, bytes memory returnData) = almImplementation.delegatecall(data);
    if (!success) _propagateAlmRevert(returnData);
  }

  /// @notice Get rebalance manager via staticcall
  function _getRebalanceManager() internal view returns (address) {
    bytes memory data = abi.encodeWithSignature('getRebalanceManager()');
    
    (bool success, bytes memory returnData) = almImplementation.staticcall(data);
    if (!success) _propagateAlmRevert(returnData);
    
    return abi.decode(returnData, (address));
  }

  /// @notice Get slow TWAP period via staticcall
  function _getSlowTwapPeriod() internal view returns (uint32) {
    bytes memory data = abi.encodeWithSignature('getSlowTwapPeriod()');
    
    (bool success, bytes memory returnData) = almImplementation.staticcall(data);
    if (!success) _propagateAlmRevert(returnData);
    
    return abi.decode(returnData, (uint32));
  }

  /// @notice Get fast TWAP period via staticcall
  function _getFastTwapPeriod() internal view returns (uint32) {
    bytes memory data = abi.encodeWithSignature('getFastTwapPeriod()');
    
    (bool success, bytes memory returnData) = almImplementation.staticcall(data);
    if (!success) _propagateAlmRevert(returnData);
    
    return abi.decode(returnData, (uint32));
  }

  /// @notice Obtain TWAP and rebalance via delegatecall
  function _obtainTWAPAndRebalance(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) internal {
    bytes memory data = abi.encodeWithSignature(
      'obtainTWAPAndRebalance(int24,int24,int24,uint32)',
      currentTick,
      slowTwapTick,
      fastTwapTick,
      lastBlockTimestamp
    );
    
    (bool success, bytes memory returnData) = almImplementation.delegatecall(data);
    if (!success) _propagateAlmRevert(returnData);
  }
}
