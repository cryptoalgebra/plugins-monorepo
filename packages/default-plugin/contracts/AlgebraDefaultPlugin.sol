// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePlugin.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPlugin.sol';
import '@cryptoalgebra/reflex-plugin/contracts/ReflexAfterSwap.sol';

/// @title Algebra Integral 1.0 adaptive fee, security and reflex plugin
contract AlgebraDefaultPlugin is DynamicFeePlugin, FarmingProxyPlugin, VolatilityOraclePlugin, SecurityPlugin, ReflexAfterSwap {
  using Plugins for uint8;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    AlgebraFeeConfiguration memory _config,
    address _securityRegistry,
    address _reflexRouter,
    bytes32 _configId
  ) BaseAbstractPlugin(_pool, _factory, _pluginFactory) DynamicFeePlugin(_config) SecurityPlugin(_securityRegistry) ReflexAfterSwap(_reflexRouter, _configId) {}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128 liquidity, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24) {
    if (liquidity < 0) {
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

  function beforeSwap(address sender, address, bool, int256, uint160, bool, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24, uint24) {
    _writeTimepoint();
    _checkStatus();
    uint88 volatilityAverage = _getAverageVolatilityLast();
    uint24 fee;
    if(sender == getRouter()){
      fee = 0;
    } else {
      fee = _getCurrentFee(volatilityAverage);
    }
    IAlgebraPool(pool).setFee(fee);
    return (IAlgebraPlugin.beforeSwap.selector);
  }

  function afterSwap(
    address,
    address,
    bool zeroToOne,
    int256,
    uint160,
    int256 amount0Out,
    int256 amount1Out,
    bytes calldata
  ) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    // farming
    _updateVirtualPoolTick(zeroToOne);

    // reflex
    bytes32 triggerPoolId = bytes32(uint256(uint160(msg.sender)));
    _reflexAfterSwap(triggerPoolId, amount0Out, amount1Out, zeroToOne, tx.origin);

    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _checkStatus();
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

  function getCurrentFee() external view override returns (uint16 fee) {
    uint88 volatilityAverage = _getAverageVolatilityLast();
    fee = _getCurrentFee(volatilityAverage);
  }

  /// @inheritdoc ReflexAfterSwap
  function _onlyReflexAdmin() internal view override {
    _authorize();
  }
}
