// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/VolatilityOracleConnector.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyConnector.sol';
import '@cryptoalgebra/price-convergence-plugin/contracts/PriceConvergenceConnector.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityConnector.sol';

import './interfaces/IAlgebraUpgradeablePlugin.sol';

/// @title Algebra Integral 1.2.2 Upgradeable Plugin
/// @notice Upgradeable plugin with VolatilityOracle, FarmingProxy, Security and Price Convergence
/// @dev Uses Beacon Proxy pattern via UpgradeableAbstractPlugin
contract AlgebraUpgradeablePlugin is
  UpgradeableAbstractPlugin,
  IAlgebraUpgradeablePlugin,
  VolatilityOracleConnector,
  FarmingProxyConnector,
  SecurityConnector,
  PriceConvergenceConnector
{
  using Plugins for uint8;

  /// @notice Constructor sets immutable values shared across ALL proxies
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _volatilityOracleImpl VolatilityOracle implementation address
  /// @param _farmingProxyImpl FarmingProxy implementation address
  /// @param _securityImpl Security implementation address
  /// @param _priceConvergenceImpl Price Convergence implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _farmingProxyImpl,
    address _securityImpl,
    address _priceConvergenceImpl
  )
    UpgradeableAbstractPlugin(_factory, _pluginFactory)
    VolatilityOracleConnector(_volatilityOracleImpl)
    FarmingProxyConnector(_farmingProxyImpl)
    SecurityConnector(_securityImpl)
    PriceConvergenceConnector(_priceConvergenceImpl)
  {}

  /// @inheritdoc IAlgebraUpgradeablePlugin
  function initialize(address securityRegistry) external override initializer onlyPluginFactory {
    // Initialize modules that require state setup
    _initializeSecurity(securityRegistry);

    emit PluginInitialized(_getPool());
  }

  function getActiveModuleNames() external pure override returns (string[] memory) {
    string[] memory activeModules = new string[](4);
    activeModules[0] = VOLATILITY_ORACLE_MODULE_NAME;
    activeModules[1] = FARMING_PROXY_MODULE_NAME;
    activeModules[2] = SECURITY_MODULE_NAME;
    activeModules[3] = PRICE_CONVERGENCE_MODULE_NAME;
    return activeModules;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return
      VOLATILITY_ORACLE_PLUGIN_CONFIG |
      FARMING_PROXY_PLUGIN_CONFIG |
      SECURITY_PLUGIN_CONFIG |
      PRICE_CONVERGENCE_PLUGIN_CONFIG;
  }

  // ========== Connector Implementations ==========

  /// @dev Required by FarmingProxyConnector
  function _getPluginFactory() internal view override returns (address) {
    return pluginFactory;
  }

  /// @dev Required by FarmingProxyConnector and PriceConvergenceConnector
  function _getPool()
    internal
    view
    override(UpgradeableAbstractPlugin, FarmingProxyConnector, PriceConvergenceConnector)
    returns (address)
  {
    return UpgradeableAbstractPlugin._getPool();
  }

  /// @dev Required by module connectors - use base class implementation
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @dev Required by PriceConvergenceConnector
  function _getFactory() internal view override returns (address) {
    return factory;
  }

  function getPool() external view override(FarmingProxyConnector, PriceConvergenceConnector) returns (address) {
    return _getPool();
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
  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeModifyPosition(
    address sender,
    address,
    int24,
    int24,
    int128 desiredLiquidityDelta,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24) {
    // Security check
    // onlyPool guarantees msg.sender is the pool
    if (desiredLiquidityDelta <= 0) {
      _checkStatusOnBurn(msg.sender);
    } else {
      _checkStatus(msg.sender);
      _checkModifyPositionCaller(sender);
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
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
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

}
