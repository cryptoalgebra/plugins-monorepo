// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeePlugin.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOraclePlugin.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityPlugin.sol';
import '@cryptoalgebra/mevx-plugin/contracts/MevxPlugin.sol';

/// @title Algebra Integral 1.0 adaptive fee, security and MEV-X plugin
contract AlgebraDefaultPlugin is DynamicFeePlugin, FarmingProxyPlugin, VolatilityOraclePlugin, SecurityPlugin, MevxPlugin {
  using Plugins for uint8;
  using VolatilityOracle for VolatilityOracle.Timepoint[UINT16_MODULO];

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    AlgebraFeeConfiguration memory _config,
    address _securityRegistry,
    MevxConfig memory _mevxConfig
  )
    BaseAbstractPlugin(_pool, _factory, _pluginFactory)
    DynamicFeePlugin(_config)
    SecurityPlugin(_securityRegistry)
    MevxPlugin(_mevxConfig)
  {}

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160 sqrtPriceX96, int24 tick) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    _initializeMevxPool(pool, sqrtPriceX96);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128 liquidity, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    if (liquidity < 0) {
      _checkStatusOnBurn();
    } else {
      _checkStatus();
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address sender, address, bool, int256, uint160, bool, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _writeTimepoint();
    _checkStatus();
    uint88 volatilityAverage = _getAverageVolatilityLast();
    uint16 fee = _getCurrentFee(volatilityAverage);
    fee = _getFeeWithMevProtection(sender, fee);
    IAlgebraPool(pool).setFee(fee);
    return (IAlgebraPlugin.beforeSwap.selector);
  }

  function afterSwap(
    address sender,
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

    // MEV-X
    _runMevxAfterSwap(msg.sender, sender, zeroToOne, amount0Out, amount1Out);

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
    if (mevProtectionFeeEnabled) {
      fee = _getFeeWithMevProtection(fee);
    }
  }
}
