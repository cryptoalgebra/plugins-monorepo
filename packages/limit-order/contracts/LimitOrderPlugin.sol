// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderManager.sol';

/// @title Algebra Integral 1.2 Limit Order plugin (non-upgradeable)
/// @notice This is the original non-upgradeable version of the LimitOrder plugin
abstract contract LimitOrderPlugin is BaseAbstractPlugin, ILimitOrderPlugin {
  using Plugins for uint8;

  uint8 private constant LIMIT_ORDER_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  address private _limitOrderManager;

  function limitOrderManager() public override returns (address) {
    return _limitOrderManager;
  }

  constructor(address limitOrderManager_) {
    _limitOrderManager = limitOrderManager_;

    defaultPluginConfig = defaultPluginConfig | LIMIT_ORDER_CONFIG;
    activeModules.push('Limit Order Plugin');
  }

  function setLimitOrderManager(address module) external override {
    _authorize();
    _limitOrderManager = module;
    emit LimitOrderManager(module);
  }

  function _updateLimitOrderManagerState(address pool, bool zeroToOne) internal {
    address manager = _limitOrderManager;
    if (manager != address(0)) {
      (, int24 tick, , ) = _getPoolState();
      ILimitOrderManager(manager).afterSwap(pool, zeroToOne, tick);
    }
  }
}
