// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IAlmPlugin.sol';
import './interfaces/IAlmPluginImplementation.sol';
import './libraries/AlmStorage.sol';

/// @title ALM Connector
/// @notice This contract provides delegatecall interface to ALM plugin implementation
abstract contract AlmConnector is BaseConnector, IAlmPlugin {
  using Plugins for uint8;

  string internal constant ALM_MODULE_NAME = 'ALM Plugin';
  uint8 internal constant ALM_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);
  address internal immutable almImplementation;

  constructor(address _almImplementation) {
    almImplementation = _almImplementation;
  }

  function _obtainTWAPAndRebalance(int24 currentTick, int24 slowTwapTick, int24 fastTwapTick, uint32 lastBlockTimestamp) internal {
    _delegateCall(
      almImplementation,
      abi.encodeCall(IAlmPluginImplementation.obtainTWAPAndRebalance, (currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp))
    );
  }

  // ###### Public Interface (IAlmPlugin) ######

  /// @inheritdoc IAlmPlugin
  function rebalanceManager() public view override returns (address) {
    return AlmStorage.layout().rebalanceManager;
  }

  /// @inheritdoc IAlmPlugin
  function slowTwapPeriod() public view override returns (uint32) {
    return AlmStorage.layout().slowTwapPeriod;
  }

  /// @inheritdoc IAlmPlugin
  function fastTwapPeriod() public view override returns (uint32) {
    return AlmStorage.layout().fastTwapPeriod;
  }

  /// @inheritdoc IAlmPlugin
  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external override {
    _authorize();
    _delegateCall(
      almImplementation,
      abi.encodeCall(IAlmPluginImplementation.initializeALM, (_rebalanceManager, _slowTwapPeriod, _fastTwapPeriod))
    );
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
