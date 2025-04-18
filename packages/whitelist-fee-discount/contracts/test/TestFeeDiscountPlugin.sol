// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import '../FeeDiscountPlugin.sol';

/// @title Algebra Integral 1.2 limit order plugin
contract TestFeeDiscountPlugin is FeeDiscountPlugin {
  using Plugins for uint8;

  uint24 fee;
  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig = uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  constructor(address _pool, address _factory, address _pluginFactory, address registry) BaseAbstractPlugin(_pool, _factory, _pluginFactory) FeeDiscountPlugin(registry){}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external override view onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata) external override onlyPool returns (bytes4, uint24, uint24) {
    fee = _applyFeeDiscount(tx.origin, msg.sender, fee);
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }


  function setFee(uint24 _newFee) external {
    fee = _newFee;
  }

}
