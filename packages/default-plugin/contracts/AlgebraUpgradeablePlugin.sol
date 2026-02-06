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
import '@cryptoalgebra/mevx-plugin/contracts/MevxConnector.sol';
import '@cryptoalgebra/whitelist-fee-discount-plugin/contracts/FeeDiscountConnector.sol';
import '@cryptoalgebra/limit-order-plugin/contracts/LimitOrderConnector.sol';
import '@cryptoalgebra/sliding-fee-plugin/contracts/SlidingFeeConnector.sol';
import '@cryptoalgebra/whitelist-fee-discount-plugin/contracts/libraries/FeeDiscountStorage.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/libraries/VolatilityOracleStorage.sol';

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
  SecurityConnector,
  MevxConnector,
  FeeDiscountConnector,
  LimitOrderConnector,
  SlidingFeeConnector
{
  using Plugins for uint8;

  struct ConnectorImplementations {
    address volatilityOracle;
    address dynamicFee;
    address farmingProxy;
    address alm;
    address security;
    address mevx;
    address feeDiscount;
    address limitOrder;
    address slidingFee;
  }

  /// @notice Constructor sets immutable values shared across ALL proxies
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param impls Connector implementation addresses
  constructor(address _factory, address _pluginFactory, ConnectorImplementations memory impls)
    UpgradeableAbstractPlugin(_factory, _pluginFactory)
    VolatilityOracleConnector(impls.volatilityOracle)
    DynamicFeeConnector(impls.dynamicFee)
    FarmingProxyConnector(impls.farmingProxy)
    AlmConnector(impls.alm)
    SecurityConnector(impls.security)
    MevxConnector(impls.mevx)
    FeeDiscountConnector(impls.feeDiscount)
    LimitOrderConnector(impls.limitOrder)
    SlidingFeeConnector(impls.slidingFee)
  {}

  /// @inheritdoc IAlgebraUpgradeablePlugin
  function initialize(
    AlgebraFeeConfiguration calldata feeConfig,
    address securityRegistry,
    address mevxRouter,
    address mevxExecutor,
    address profitDistributor,
    bytes32 mevxConfigId,
    address feeDiscountRegistry,
    address limitOrderManager
  ) external override initializer onlyPluginFactory {
    // Initialize modules that require state setup
    _initializeDynamicFee(feeConfig);
    _initializeSecurity(securityRegistry);
    _initializeMevx(mevxRouter, mevxExecutor, profitDistributor, mevxConfigId);
    _initializeFeeDiscount(feeDiscountRegistry);
    _initializeLimitOrder(limitOrderManager);
    _initializeSlidingFee(feeConfig.baseFee);

    emit PluginInitialized(_getPool());
  }

  function getActiveModuleNames() external pure override returns (string[] memory) {
    string[] memory activeModules = new string[](9);
    activeModules[0] = VOLATILITY_ORACLE_MODULE_NAME;
    activeModules[1] = DYNAMIC_FEE_MODULE_NAME;
    activeModules[2] = FARMING_PROXY_MODULE_NAME;
    activeModules[3] = ALM_MODULE_NAME;
    activeModules[4] = SECURITY_MODULE_NAME;
    activeModules[5] = MEVX_MODULE_NAME;
    activeModules[6] = SLIDING_FEE_MODULE_NAME;
    activeModules[7] = FEE_DISCOUNT_MODULE_NAME;
    activeModules[8] = LIMIT_ORDER_MODULE_NAME;
    return activeModules;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return
      VOLATILITY_ORACLE_PLUGIN_CONFIG |
      DYNAMIC_FEE_PLUGIN_CONFIG |
      FARMING_PROXY_PLUGIN_CONFIG |
      ALM_PLUGIN_CONFIG |
      SECURITY_PLUGIN_CONFIG |
      MEVX_PLUGIN_CONFIG |
      SLIDING_FEE_PLUGIN_CONFIG |
      FEE_DISCOUNT_PLUGIN_CONFIG |
      LIMIT_ORDER_PLUGIN_CONFIG;
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
  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function afterInitialize(address, uint160 sqrtPriceX96, int24 tick) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    // mevx
    _initializePool(msg.sender, sqrtPriceX96);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeModifyPosition(
    address,
    address,
    int24,
    int24,
    int128 desiredLiquidityDelta,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24) {
    // Security check
    // onlyPool guarantees msg.sender is the pool
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
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeSwap(
    address sender,
    address,
    bool zeroToOne,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24 finalFee) {
    // Security check
    // since we check that the hook is called by the pool, we can use msg.sender instead of _getPool()
    _checkStatus(msg.sender);

    (, int24 tick, , ) = _getPoolState();
    (, , , , int24 lastTick, , ) = timepoints(timepointIndex());

    _writeTimepoint();
    address router = getMevxRouter();
    if(sender == router || tx.origin == router){
      finalFee = 1;
    } else {
        uint88 volatilityAverage = _getAverageVolatilityLast();
        uint16 fee = _getCurrentFee(volatilityAverage);

        // SlidingFee uses DynamicFee as base fee
        if (slidingFeeEnabled()) {
          fee = _getFeeAndUpdateFactorsWithBaseFee(zeroToOne, tick, lastTick, fee);
        }

        // Whitelist discount after sliding
        if (feeDiscountRegistry() != address(0)) {
          finalFee = _applyFeeDiscount(tx.origin, msg.sender, fee);
        }
    }
    return (IAlgebraPlugin.beforeSwap.selector, finalFee, 0);
  }

  /// @inheritdoc IAlgebraPlugin
  function afterSwap(
    address,
    address recipient,
    bool zeroToOne,
    int256,
    uint160,
    int256 amount0Delta,
    int256 amount1Delta,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    (, int24 tick, , ) = _getPoolState();

    // Update virtual pool for farming
    _updateVirtualPoolTick(zeroToOne, tick);

    // Obtain TWAP and trigger rebalance
    _triggerAlmRebalance(tick);

    // Limit orders
    _updateLimitOrderManagerState(msg.sender, zeroToOne, tick);

    // MEVX
    if(getMevxRouter() != address(0)) {
      _mevxAfterSwap(msg.sender, zeroToOne, amount0Delta, amount1Delta, recipient);
    }

    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    // Security check
    // since we check that the hook is called by the pool, we can use msg.sender instead of _getPool()
    _checkStatus(msg.sender);

    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
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
