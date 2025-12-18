// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../LimitOrderConnector.sol';
import '../interfaces/ILimitOrderManager.sol';

/// @title Upgradeable LimitOrder Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with LimitOrder connector
contract UpgradeableLimitOrderPluginTest is UpgradeableAbstractPlugin, LimitOrderConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _limitOrderImplementation The LimitOrder implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _limitOrderImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) LimitOrderConnector(_limitOrderImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  /// @param _pool The pool address this plugin is attached to
  /// @param _limitOrderManager The limit order manager address
  function initialize(address _pool, address _limitOrderManager) external initializer onlyPluginFactory {

    uint8 limitOrderConfig = _initializeLimitOrder(_limitOrderManager);
    _setDefaultPluginConfig(_getDefaultPluginConfig() | limitOrderConfig);

    _appendActiveModule('Limit Order Plugin');
  }

  // ###### HOOKS ######

  function beforeInitialize(
    address,
    uint160
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

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
    _updateLimitOrderManagerState(_getPool(), zeroToOne, tick);
    return IAlgebraPlugin.afterSwap.selector;
  }

  // ###### Authorization ######

  /// @dev Authorization check for LimitOrderConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
