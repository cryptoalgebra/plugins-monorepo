// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderModule.sol';

/// @title Algebra Integral 1.2 security plugin
abstract contract LimitOrderPlugin is BaseAbstractPlugin, ILimitOrderPlugin {
  using Plugins for uint8;

  uint8 private constant defaultPluginConfig = uint8(Plugins.AFTER_SWAP_FLAG);

  address public override limitOrderModule;

  constructor(address _limitOrderModule) {
    limitOrderModule = _limitOrderModule;
  }

  function setLimitOrderModule(address module) external override {
    _authorize();

    limitOrderModule = module;
    emit LimitOrderModule(module);
  }

  function _updateLimitOrderModuleState(address pool, bool zeroToOne) internal {
    if (limitOrderModule != address(0)) {
      (, int24 tick, , ) = _getPoolState();
      ILimitOrderModule(limitOrderModule).afterSwap(pool, zeroToOne, tick);
    }
  }
}
