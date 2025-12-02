// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IAlmPlugin.sol';
import './interfaces/IAlmPluginImplementation.sol';

/// @title ALM Connector
/// @notice This contract provides delegatecall interface to ALM plugin implementation
abstract contract AlmConnector is BaseConnector, IAlmPlugin {
  using Plugins for uint8;

  uint8 internal constant ALM_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);
  address internal immutable almImplementation;

  /// @dev Storage namespace for ALM plugin using ERC-7201
  bytes32 internal constant ALM_NAMESPACE = keccak256('algebra.storage.alm');

  struct AlmLayout {
    address rebalanceManager;
    uint32 slowTwapPeriod;
    uint32 fastTwapPeriod;
  }

  /// @dev Fetch pointer of ALM plugin's storage for direct view access
  function _getAlmLayout() internal pure returns (AlmLayout storage layout) {
    bytes32 position = ALM_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  constructor(address _almImplementation) {
    almImplementation = _almImplementation;
  }

  function _initializeAlm(
    address _rebalanceManager,
    uint32 _slowTwapPeriod,
    uint32 _fastTwapPeriod
  ) internal returns (uint8) {
    _delegateCall(
      almImplementation,
      abi.encodeCall(IAlmPluginImplementation.initializeALM, (_rebalanceManager, _slowTwapPeriod, _fastTwapPeriod))
    );
    return ALM_PLUGIN_CONFIG;
  }

  function _obtainTWAPAndRebalance(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) internal {
    _delegateCall(
      almImplementation,
      abi.encodeCall(
        IAlmPluginImplementation.obtainTWAPAndRebalance,
        (currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp)
      )
    );
  }

  function _getSlowTwapPeriod() internal view returns (uint32) {
    return _getAlmLayout().slowTwapPeriod;
  }

  function _getFastTwapPeriod() internal view returns (uint32) {
    return _getAlmLayout().fastTwapPeriod;
  }

  // ###### Public Interface (IAlmPlugin) ######

  /// @inheritdoc IAlmPlugin
  function rebalanceManager() external view override returns (address) {
    return _getAlmLayout().rebalanceManager;
  }

  /// @inheritdoc IAlmPlugin
  function slowTwapPeriod() external view override returns (uint32) {
    return _getSlowTwapPeriod();
  }

  /// @inheritdoc IAlmPlugin
  function fastTwapPeriod() external view override returns (uint32) {
    return _getFastTwapPeriod();
  }

  /// @inheritdoc IAlmPlugin
  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external override {
    _authorize();
    _initializeAlm(_rebalanceManager, _slowTwapPeriod, _fastTwapPeriod);
  }

  /// @inheritdoc IAlmPlugin
  function setSlowTwapPeriod(uint32 _slowTwapPeriod) external override {
    _authorize();
    _delegateCall(almImplementation, abi.encodeCall(IAlmPluginImplementation.setSlowTwapPeriod, (_slowTwapPeriod)));
  }

  /// @inheritdoc IAlmPlugin
  function setFastTwapPeriod(uint32 _fastTwapPeriod) external override {
    _authorize();
    _delegateCall(almImplementation, abi.encodeCall(IAlmPluginImplementation.setFastTwapPeriod, (_fastTwapPeriod)));
  }

  /// @inheritdoc IAlmPlugin
  function setRebalanceManager(address _rebalanceManager) external override {
    _authorize();
    _delegateCall(almImplementation, abi.encodeCall(IAlmPluginImplementation.setRebalanceManager, (_rebalanceManager)));
  }
}
