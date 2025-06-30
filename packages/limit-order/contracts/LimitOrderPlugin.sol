// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderManager.sol';

/// @title Algebra Integral 1.2 security plugin
abstract contract LimitOrderPlugin is BaseAbstractPlugin, ILimitOrderPlugin {
  using Plugins for uint8;

  uint8 private constant defaultPluginConfig = uint8(Plugins.AFTER_SWAP_FLAG);

  address public override limitOrderManager;

  constructor(address _limitOrderManager) {
    limitOrderManager = _limitOrderManager;
  }

  function setLimitOrderManager(address module) external override {
    _authorize();

    limitOrderManager = module;
    emit LimitOrderManager(module);
  }

  function _updateLimitOrderManagerState(address pool, bool zeroToOne) internal {
    if (limitOrderManager != address(0)) {
      (, int24 tick, , ) = _getPoolState();
      ILimitOrderManager(limitOrderManager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
