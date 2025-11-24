// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderManager.sol';
import './LimitOrderConnector.sol';

/// @title Algebra Integral 1.2 security plugin
abstract contract LimitOrderPlugin is BaseAbstractPlugin, LimitOrderConnector, ILimitOrderPlugin {
  using Plugins for uint8;

  uint8 private constant LIMIT_ORDER_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  function limitOrderManager() public view override returns (address) {
    return _getLimitOrderLayout().limitOrderManager;
  }

  constructor(address _limitOrderManager) {
    LimitOrderLayout storage layout = _getLimitOrderLayout();
    layout.limitOrderManager = _limitOrderManager;
    
    defaultPluginConfig = defaultPluginConfig | LIMIT_ORDER_CONFIG;
    activeModules.push("Limit Order Plugin");
  }

  function setLimitOrderManager(address module) external override {
    _authorize();

    LimitOrderLayout storage layout = _getLimitOrderLayout();
    layout.limitOrderManager = module;
    emit LimitOrderManager(module);
  }

  function _updateLimitOrderManagerState(address pool, bool zeroToOne) internal {
    LimitOrderLayout memory layout = _getLimitOrderLayout();
    if (layout.limitOrderManager != address(0)) {
      (, int24 tick, , ) = _getPoolState();
      ILimitOrderManager(layout.limitOrderManager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
