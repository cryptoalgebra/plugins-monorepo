// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import '../interfaces/ILimitOrderModule.sol';
import '../LimitOrderPlugin.sol';

/// @title Algebra Integral 1.2 limit order plugin
contract LimitOrderTestPlugin is LimitOrderPlugin {
  using Plugins for uint8;

  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig = uint8(Plugins.AFTER_INIT_FLAG | Plugins.AFTER_SWAP_FLAG);

  constructor(address _pool, address _factory, address _pluginFactory, address limitOrderModule) BaseAbstractPlugin(_pool, _factory, _pluginFactory) LimitOrderPlugin(limitOrderModule){}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    if (limitOrderModule != address(0)) {
      ILimitOrderModule(limitOrderModule).afterInitialize(pool, tick);
    }
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes calldata) external override onlyPool returns (bytes4) {
    _updateLimitOrderModuleState(msg.sender, zeroToOne);
    return IAlgebraPlugin.afterSwap.selector;
  }

}
