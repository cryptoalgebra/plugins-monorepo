// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IRebalanceManager.sol';

/// @title ALM Plugin Implementation
/// @notice This contract contains ALL logic for ALM plugin that works with namespaced storage
/// @dev Called via delegatecall from AlmConnector to reduce main contract size
contract AlmPluginImplementation {
  /// @dev Storage namespace for ALM plugin using ERC-7201
  bytes32 internal constant ALM_NAMESPACE = keccak256('algebra.storage.alm');

  struct AlmLayout {
    address rebalanceManager;
    uint32 slowTwapPeriod;
    uint32 fastTwapPeriod;
  }

  /// @dev Fetch pointer of ALM plugin's storage
  function _getAlmLayout() internal pure returns (AlmLayout storage layout) {
    bytes32 position = ALM_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize ALM plugin with configuration
  /// @dev Called via delegatecall from connector
  /// @param _rebalanceManager Address of rebalance manager
  /// @param _slowTwapPeriod Period in seconds to get slow TWAP
  /// @param _fastTwapPeriod Period in seconds to get fast TWAP
  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external {
    require(_rebalanceManager != address(0), '_rebalanceManager must be non zero address');
    require(_slowTwapPeriod >= _fastTwapPeriod, '_slowTwapPeriod must be >= _fastTwapPeriod');
    
    AlmLayout storage layout = _getAlmLayout();
    layout.rebalanceManager = _rebalanceManager;
    layout.slowTwapPeriod = _slowTwapPeriod;
    layout.fastTwapPeriod = _fastTwapPeriod;
  }

  /// @notice Set slow TWAP period
  /// @dev Called via delegatecall from connector
  /// @param _slowTwapPeriod Period in seconds to get slow TWAP
  function setSlowTwapPeriod(uint32 _slowTwapPeriod) external {
    AlmLayout storage layout = _getAlmLayout();
    require(_slowTwapPeriod >= layout.fastTwapPeriod, '_slowTwapPeriod must be >= fastTwapPeriod');
    layout.slowTwapPeriod = _slowTwapPeriod;
  }

  /// @notice Set fast TWAP period
  /// @dev Called via delegatecall from connector
  /// @param _fastTwapPeriod Period in seconds to get fast TWAP
  function setFastTwapPeriod(uint32 _fastTwapPeriod) external {
    AlmLayout storage layout = _getAlmLayout();
    require(_fastTwapPeriod <= layout.slowTwapPeriod, '_fastTwapPeriod must be <= slowTwapPeriod');
    layout.fastTwapPeriod = _fastTwapPeriod;
  }

  /// @notice Set rebalance manager
  /// @dev Called via delegatecall from connector
  /// @param _rebalanceManager Address of rebalance manager
  function setRebalanceManager(address _rebalanceManager) external {
    AlmLayout storage layout = _getAlmLayout();
    layout.rebalanceManager = _rebalanceManager;
  }

  /// @notice Get rebalance manager address
  /// @dev Called via staticcall from connector
  /// @return Address of rebalance manager
  function getRebalanceManager() external view returns (address) {
    AlmLayout storage layout = _getAlmLayout();
    return layout.rebalanceManager;
  }

  /// @notice Get slow TWAP period
  /// @dev Called via staticcall from connector
  /// @return Period in seconds
  function getSlowTwapPeriod() external view returns (uint32) {
    AlmLayout storage layout = _getAlmLayout();
    return layout.slowTwapPeriod;
  }

  /// @notice Get fast TWAP period
  /// @dev Called via staticcall from connector
  /// @return Period in seconds
  function getFastTwapPeriod() external view returns (uint32) {
    AlmLayout storage layout = _getAlmLayout();
    return layout.fastTwapPeriod;
  }

  /// @notice Obtain TWAP and trigger rebalance
  /// @dev Called via delegatecall from connector
  /// @param currentTick Current pool tick
  /// @param slowTwapTick Slow TWAP tick
  /// @param fastTwapTick Fast TWAP tick
  /// @param lastBlockTimestamp Last block timestamp
  function obtainTWAPAndRebalance(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) external {
    AlmLayout storage layout = _getAlmLayout();
    address manager = layout.rebalanceManager;
    
    if (manager != address(0)) {
      IRebalanceManager(manager).obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
    }
  }
}
