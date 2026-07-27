// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../PermissionedPoolConnector.sol';
import '../interfaces/IPermissionedPoolPlugin.sol';

/// @title Upgradeable Permissioned Pool Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with Permissioned Pool connector
contract UpgradeablePermissionedPoolPluginTest is UpgradeableAbstractPlugin, PermissionedPoolConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _permissionedPoolImplementation The Permissioned Pool implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _permissionedPoolImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) PermissionedPoolConnector(_permissionedPoolImplementation) {}

  function initialize(address, address _permissionsAdapterFactory) external initializer onlyPluginFactory {
    _initializePermissionedPool(_permissionsAdapterFactory);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = PERMISSIONED_POOL_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return PERMISSIONED_POOL_PLUGIN_CONFIG;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external override onlyPool returns (bytes4) {
    _permissionedPoolVerifyInitialize(_getPool());
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeSwap(
    address sender,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    _permissionedPoolVerifySwap(_getPool(), sender);
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function beforeModifyPosition(
    address sender,
    address,
    int24,
    int24,
    int128 liquidityDelta,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24) {
    // Only verify on add liquidity (positive delta), allow remove always
    if (liquidityDelta > 0) {
      _permissionedPoolVerifyAddLiquidity(_getPool(), sender);
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function beforeFlash(address sender, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _permissionedPoolVerifyFlash(_getPool(), sender);
    return IAlgebraPlugin.beforeFlash.selector;
  }

  // ###### Authorization ######

  /// @dev Authorization check for PermissionedPoolConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
