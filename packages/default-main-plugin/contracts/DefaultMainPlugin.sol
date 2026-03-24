// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/managed-fee-plugin/contracts/ManagedSwapFeePlugin.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPlugin.sol';
import '@cryptoalgebra/limit-order-plugin/contracts/LimitOrderPlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPlugin.sol';

import '@cryptoalgebra/integral-periphery/contracts/interfaces/ISwapRouter.sol';

import './interfaces/IDefaultMainPlugin.sol';

/// @title Algebra Integral 1.2.2 default main plugin
contract DefaultMainPlugin is VolatilityOraclePlugin, ManagedSwapFeePlugin, FarmingProxyPlugin, LimitOrderPlugin, SecurityPlugin, IDefaultMainPlugin {
  using Plugins for uint8;

  uint24 public defaultFee;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    address _limitOrderManager,
    address _securityRegistry
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) ManagedSwapFeePlugin() LimitOrderPlugin(_limitOrderManager) SecurityPlugin(_securityRegistry) {
 }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeModifyPosition(address, address, int24, int24, int128 liquidityDelta, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24) {
    if (liquidityDelta <= 0) {
      _checkStatusOnBurn();
    } else {
      _checkStatus();
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata swapCallbackData) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24, uint24) {    
    _checkStatus();

    uint24 fee;

    _writeTimepoint();

    (bool success, ) = address(this).staticcall(
      abi.encodeWithSelector(this.decodeSwapCallbackData.selector, swapCallbackData)
    );

    if (success) {
      ISwapRouter.SwapCallbackData memory swapData = abi.decode(swapCallbackData, (ISwapRouter.SwapCallbackData));
      if(swapData.pluginData.length > 0) {
        fee = _getManagedFee(swapData.pluginData);
      } else {
        fee = defaultFee;
      }
    } else {
      fee = defaultFee;
    }

    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }
  
  /// @dev unused
  function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updateLimitOrderManagerState(pool, zeroToOne);

    _updateVirtualPoolTick(zeroToOne);
    return IAlgebraPlugin.afterSwap.selector;
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _checkStatus();
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
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

  function decodeSwapCallbackData(bytes memory data) public pure returns (ISwapRouter.SwapCallbackData memory callbackData) {
    (callbackData) = abi.decode(data, (ISwapRouter.SwapCallbackData));
  }
}
