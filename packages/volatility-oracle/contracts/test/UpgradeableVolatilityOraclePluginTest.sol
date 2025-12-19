// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../VolatilityOracleConnector.sol';
import '../libraries/VolatilityOracle.sol';

/// @title Upgradeable VolatilityOracle Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with VolatilityOracle connector
contract UpgradeableVolatilityOraclePluginTest is UpgradeableAbstractPlugin, VolatilityOracleConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _volatilityOracleImplementation The VolatilityOracle implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) VolatilityOracleConnector(_volatilityOracleImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  function initializePlugin() external initializer {

    (uint8 pluginConfig, string memory moduleName) = _initializeVolatilityOracle();
    _setDefaultPluginConfig(_getDefaultPluginConfig() | pluginConfig);

    _appendActiveModule(moduleName);
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24 tick) external override onlyPool returns (bytes4) {
    _initialize_TWAP(tick);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    _writeTimepoint();
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  // ###### Required overrides ######

  function _getPoolState()
    internal
    view
    override(UpgradeableAbstractPlugin, VolatilityOracleConnector)
    returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig)
  {
    return UpgradeableAbstractPlugin._getPoolState();
  }

  function _blockTimestamp() internal view override(Timestamp, VolatilityOracleConnector) returns (uint32) {
    return uint32(block.timestamp);
  }

  // ###### Authorization ######

  /// @dev Authorization check - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
