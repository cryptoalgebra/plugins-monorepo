// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/DynamicFeeConnector.sol';
import '@cryptoalgebra/dynamic-fee-plugin/contracts/types/AlgebraFeeConfiguration.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOracleConnector.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyConnector.sol';
import '@cryptoalgebra/alm-plugin/contracts/AlmConnector.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityConnector.sol';

import './interfaces/IAlgebraUpgradeablePlugin.sol';

/// @title Algebra Integral 1.2.2 Upgradeable Plugin
/// @notice Full-featured upgradeable plugin with VolatilityOracle, DynamicFee, FarmingProxy, ALM and Security
/// @dev Uses Beacon Proxy pattern via UpgradeableAbstractPlugin
contract AlgebraUpgradeablePlugin is
  UpgradeableAbstractPlugin,
  IAlgebraUpgradeablePlugin,
  VolatilityOracleConnector,
  DynamicFeeConnector,
  FarmingProxyConnector,
  AlmConnector,
  SecurityConnector
{
  using Plugins for uint8;

  /// @notice Constructor sets immutable values shared across ALL proxies
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _volatilityOracleImpl VolatilityOracle implementation address
  /// @param _dynamicFeeImpl DynamicFee implementation address
  /// @param _farmingProxyImpl FarmingProxy implementation address
  /// @param _almImpl ALM implementation address
  /// @param _securityImpl Security implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl
  )
    UpgradeableAbstractPlugin(_factory, _pluginFactory)
    VolatilityOracleConnector(_volatilityOracleImpl)
    DynamicFeeConnector(_dynamicFeeImpl)
    FarmingProxyConnector(_farmingProxyImpl)
    AlmConnector(_almImpl)
    SecurityConnector(_securityImpl)
  {}

  /// @inheritdoc IAlgebraUpgradeablePlugin
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry
  ) external override initializer onlyPluginFactory {
    uint8 config;
    uint8 pluginConfig;
    string memory moduleName;

    // Initialize VolatilityOracle
    (pluginConfig, moduleName) = _initializeVolatilityOracle();
    config = config | pluginConfig;
    _appendActiveModule(moduleName);

    // Initialize DynamicFee
    (pluginConfig, moduleName) = _initializeDynamicFee(feeConfig);
    config = config | pluginConfig;
    _appendActiveModule(moduleName);

    // Initialize FarmingProxy
    (pluginConfig, moduleName) = _initializeFarmingProxy();
    config = config | pluginConfig;
    _appendActiveModule(moduleName);

    // Initialize ALM 
    (pluginConfig, moduleName) = _initializeAlm();
    config = config | pluginConfig;
    _appendActiveModule(moduleName);

    // Initialize Security
    (pluginConfig, moduleName) = _initializeSecurity(securityRegistry);
    config = config | pluginConfig;
    _appendActiveModule(moduleName);

    _setDefaultPluginConfig(config);

    emit PluginInitialized(_getPool());
  }

  // ========== Connector Implementations ==========

  /// @dev Required by FarmingProxyConnector
  function _getPluginFactory() internal view override returns (address) {
    return pluginFactory;
  }

  /// @dev Required by FarmingProxyConnector
  function _getPool() internal view override(UpgradeableAbstractPlugin, FarmingProxyConnector) returns (address) {
    return UpgradeableAbstractPlugin._getPool();
  }

  /// @dev Required by DynamicFeeConnector, AlmConnector, SecurityConnector - use base class implementation
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @dev Override _getPoolState from UpgradeableAbstractPlugin for VolatilityOracleConnector
  function _getPoolState()
    internal
    view
    override(UpgradeableAbstractPlugin, VolatilityOracleConnector)
    returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig)
  {
    return UpgradeableAbstractPlugin._getPoolState();
  }

  /// @dev Override _blockTimestamp from Timestamp for VolatilityOracleConnector
  function _blockTimestamp() internal view virtual override(Timestamp, VolatilityOracleConnector) returns (uint32) {
    return Timestamp._blockTimestamp();
  }

  // ========== HOOKS ==========

  /// @inheritdoc IAlgebraPlugin
  function beforeInitialize(
    address ,
    uint160
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function afterInitialize(
    address ,
    uint160 ,
    int24 tick
  ) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeModifyPosition(
    address ,
    address ,
    int24 ,
    int24 ,
    int128 desiredLiquidityDelta,
    bytes calldata 
  ) external override onlyPool returns (bytes4, uint24) {
    // Security check - different logic for burns (negative liquidity) vs mints
    // since we check that the hook is called by the pool, we can use msg.sender instead of _getPool()
    if (desiredLiquidityDelta < 0) {
      _checkStatusOnBurn(msg.sender);
    } else {
      _checkStatus(msg.sender);
    }

    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @inheritdoc IAlgebraPlugin
  function afterModifyPosition(
    address,
    address,
    int24,
    int24,
    int128,
    uint256,
    uint256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    // Security check
    // since we check that the hook is called by the pool, we can use msg.sender instead of _getPool()
    _checkStatus(msg.sender);

    _writeTimepoint();
    uint88 volatilityAverage = _getAverageVolatilityLast();
    uint24 fee = _getCurrentFee(volatilityAverage);
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }

  /// @inheritdoc IAlgebraPlugin
  function afterSwap(
    address,
    address,
    bool zeroToOne,
    int256,
    uint160,
    int256,
    int256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    (, int24 tick, , ) = _getPoolState();

    // Update virtual pool for farming
    _updateVirtualPoolTick(zeroToOne, tick);

    // ALM: Obtain TWAP and trigger rebalance
    _triggerAlmRebalance(tick);

    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeFlash(
    address,
    address,
    uint256,
    uint256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    // Security check
    // since we check that the hook is called by the pool, we can use msg.sender instead of _getPool()
    _checkStatus(msg.sender);

    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function afterFlash(
    address,
    address,
    uint256,
    uint256,
    uint256,
    uint256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.afterFlash.selector;
  }

  // ========== Fee Getter ==========

  /// @notice Returns current fee based on current volatility
  /// @return fee The current fee value
  function getCurrentFee() external view override returns (uint16 fee) {
    uint88 volatilityAverage = _getAverageVolatilityLast();
    fee = _getCurrentFee(volatilityAverage);
  }

  // ========== ALM Helper Functions ==========

  /// @dev Trigger ALM rebalance with TWAP data
  function _triggerAlmRebalance(int24 currentTick) internal {
    // Get TWAP periods from ALM
    uint32 slowPeriod = slowTwapPeriod();
    uint32 fastPeriod = fastTwapPeriod();

    // rebalance happens only if rebalanceManager != 0 and we have enough history for slowTwapPeriod.
    if (rebalanceManager() != address(0) && _canGetTwap(slowPeriod)) {
      int24 slowTwapTick = _getTwapTick(slowPeriod);
      int24 fastTwapTick = _getTwapTick(fastPeriod);
      _obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, lastTimepointTimestamp());
    }
  }
}
