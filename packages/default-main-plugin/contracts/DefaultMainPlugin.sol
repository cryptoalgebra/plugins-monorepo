// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/managed-fee-plugin/contracts/ManagedSwapFeePlugin.sol';

import '@cryptoalgebra/integral-periphery/contracts/interfaces/ISwapRouter.sol';

import './interfaces/IDefaultMainPlugin.sol';

/// @title Algebra Integral 1.2.1 default main plugin
contract DefaultMainPlugin is VolatilityOraclePlugin, ManagedSwapFeePlugin, IDefaultMainPlugin {
  using Plugins for uint8;

  /// @inheritdoc IAlgebraPlugin
  uint8 public constant override defaultPluginConfig =
    uint8(Plugins.AFTER_INIT_FLAG | Plugins.BEFORE_SWAP_FLAG);

  uint24 public defaultFee;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    address _router
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) ManagedSwapFeePlugin(_router) {}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external override onlyPool returns (bytes4, uint24) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address sender, address, bool, int256, uint160, bool, bytes calldata swapCallbackData) external override onlyPool returns (bytes4, uint24, uint24) {    
    _writeTimepoint();
    
    uint24 fee = _getFee(sender, swapCallbackData);

    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }
  
  /// @dev unused
  function afterSwap(address, address, bool, int256, uint160, int256, int256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function setDefaultFee(uint24 _defaultFee) external {
    _authorize();
    defaultFee = _defaultFee;
  }

  function getAverageVolatilityLast() external view override returns (uint88 averageVolatilityLast) {
    averageVolatilityLast = _getAverageVolatilityLast();
  }

  function _getFee(address sender, bytes calldata swapCallbackData) internal returns (uint24) {
    if (sender == router){
      ISwapRouter.SwapCallbackData memory swapData = abi.decode(swapCallbackData, (ISwapRouter.SwapCallbackData));
      if(swapData.pluginData.length > 0) {
        return _getManagedFee(swapData.pluginData);
      } else {
        return defaultFee;
      }
    } else {
      return defaultFee;
    }
  }
}
