// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../SecurityConnector.sol';

/// @title Upgradeable Security Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with Security connector
contract UpgradeableSecurityPluginTest is UpgradeableAbstractPlugin, SecurityConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _securityImplementation The Security implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _securityImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) SecurityConnector(_securityImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  /// @param _pool The pool address this plugin is attached to
  /// @param _securityRegistry The security registry address
  function initialize(address _pool, address _securityRegistry) external initializer onlyPluginFactory {

    uint8 securityConfig = _initializeSecurity(_securityRegistry);
    defaultPluginConfig = defaultPluginConfig | securityConfig;

    activeModules.push('Security Plugin');
  }

  // ###### HOOKS ######

  function beforeInitialize(
    address,
    uint160
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
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
    _checkStatus(_getPool());
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function beforeFlash(
    address,
    address,
    uint256,
    uint256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    _checkStatus(_getPool());
    return IAlgebraPlugin.beforeFlash.selector;
  }

  function beforeModifyPosition(
    address,
    address,
    int24,
    int24,
    int128 liquidityDelta,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24) {
    if (liquidityDelta > 0) {
      _checkStatus(_getPool());
    } else {
      _checkStatusOnBurn(_getPool());
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  // ###### Authorization ######

  /// @dev Authorization check for SecurityConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
