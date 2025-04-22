// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';
import './interfaces/IAlmPlugin.sol';
import './interfaces/IRebalanceManager.sol';


abstract contract AlmPlugin is BaseAbstractPlugin, IAlmPlugin {
  /// @inheritdoc	IAlmPlugin
  address public rebalanceManager;

  /// @inheritdoc	IAlmPlugin
  uint32 public slowTwapPeriod;
  
  /// @inheritdoc	IAlmPlugin
  uint32 public fastTwapPeriod;

  /// @inheritdoc	IAlmPlugin
  function initializeALM(address _rebalanceManager, uint32 _slowTwapPeriod, uint32 _fastTwapPeriod) external {
    _authorize();
    require(_rebalanceManager != address(0), '_rebalanceManager must be non zero address');
    require(_slowTwapPeriod >= _fastTwapPeriod, '_slowTwapPeriod must be >= _fastTwapPeriod');
    rebalanceManager = _rebalanceManager;
    slowTwapPeriod = _slowTwapPeriod;
    fastTwapPeriod = _fastTwapPeriod;
  }

  /// @inheritdoc	IAlmPlugin
  function setSlowTwapPeriod(uint32 _slowTwapPeriod) external {
    _authorize();
    require(_slowTwapPeriod >= fastTwapPeriod, '_slowTwapPeriod must be >= fastTwapPeriod');
    slowTwapPeriod = _slowTwapPeriod;
  }

  /// @inheritdoc	IAlmPlugin
  function setFastTwapPeriod(uint32 _fastTwapPeriod) external {
    _authorize();
    require(_fastTwapPeriod <= slowTwapPeriod, '_fastTwapPeriod must be <= slowTwapPeriod');
    fastTwapPeriod = _fastTwapPeriod;
  }

  /// @inheritdoc	IAlmPlugin
  function setRebalanceManager(address _rebalanceManager) external {
    _authorize();
    rebalanceManager = _rebalanceManager;
  }

  function _obtainTWAPAndRebalance(
    int24 currentTick,
    int24 slowTwapTick,
    int24 fastTwapTick,
    uint32 lastBlockTimestamp
  ) internal {
    IRebalanceManager(rebalanceManager).obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, lastBlockTimestamp);
  }
}
