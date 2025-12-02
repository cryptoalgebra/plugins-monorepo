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
    address _pool,
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address rebalanceManager,
    uint32 slowTwapPeriod,
    uint32 fastTwapPeriod
  ) external override initializer onlyPluginFactory {
    __UpgradeableAbstractPlugin_init(_pool);

    // Build plugin config from all modules
    uint8 config = 0;

    // 1. Initialize VolatilityOracle
    config = config | _initializeVolatilityOracleState();
    activeModules.push('Volatility Oracle');

    // 2. Initialize DynamicFee with provided config
    config = config | _initializeDynamicFee(feeConfig);
    activeModules.push('Dynamic Fee');

    // 3. Initialize FarmingProxy
    config = config | _initializeFarmingProxy();
    activeModules.push('Farming Proxy');

    // 4. Initialize ALM if rebalance manager is provided
    if (rebalanceManager != address(0)) {
      config = config | _initializeAlm(rebalanceManager, slowTwapPeriod, fastTwapPeriod);
      activeModules.push('ALM');
    }

    // 5. Initialize Security if registry is provided
    if (securityRegistry != address(0)) {
      config = config | _initializeSecurity(securityRegistry);
      activeModules.push('Security');
    }

    defaultPluginConfig = config;

    emit PluginInitialized(_pool);
  }

  // ========== Connector Implementations ==========

  /// @dev Required by FarmingProxyConnector
  function _getPluginFactory() internal view override returns (address) {
    return pluginFactory;
  }

  /// @dev Required by FarmingProxyConnector
  function _getPool() internal view override returns (address) {
    return pool;
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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function afterInitialize(
    address ,
    uint160 ,
    int24 tick
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _initialize_TWAP(_blockTimestamp(), tick);
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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24) {
    // Security check - different logic for burns (negative liquidity) vs mints
    if (desiredLiquidityDelta < 0) {
      _checkStatusOnBurn(pool);
    } else {
      _checkStatus(pool);
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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24, uint24) {
    // Security check
    _checkStatus(pool);

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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    // Security check
    _checkStatus(pool);

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
  ) external override(UpgradeableAbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
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
    uint32 slowPeriod = _getSlowTwapPeriod();
    uint32 fastPeriod = _getFastTwapPeriod();

    // Skip if ALM is not initialized (both periods are 0)
    if (slowPeriod == 0 && fastPeriod == 0) return;

    // Get TWAP ticks if we have enough history
    int24 slowTwapTick = currentTick;
    int24 fastTwapTick = currentTick;

    if (_canGetTwap(slowPeriod)) {
      slowTwapTick = _getTwapTick(slowPeriod);
    }

    if (_canGetTwap(fastPeriod)) {
      fastTwapTick = _getTwapTick(fastPeriod);
    }

    // Call ALM rebalance with TWAP data
    _obtainTWAPAndRebalance(currentTick, slowTwapTick, fastTwapTick, _getOracleLastTimestamp());
  }
}
