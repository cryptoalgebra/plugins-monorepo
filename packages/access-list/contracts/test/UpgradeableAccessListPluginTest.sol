// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../AccessListConnector.sol';
import '../interfaces/IAccessListPlugin.sol';

/// @title Upgradeable Access List Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with Access List connector
contract UpgradeableAccessListPluginTest is UpgradeableAbstractPlugin, AccessListConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _accessListImplementation The Access List implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _accessListImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) AccessListConnector(_accessListImplementation) {}

  function initialize(address , address _accessListRegistry) external initializer onlyPluginFactory {
    _initializeAccessList(_accessListRegistry);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = ACCESS_LIST_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return ACCESS_LIST_PLUGIN_CONFIG;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external override onlyPool returns (bytes4) {
    _accessListVerifyInitialize(_getPool());
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
    _accessListVerifySwap(_getPool());
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function beforeModifyPosition(
    address,
    address,
    int24,
    int24,
    int128 liquidityDelta,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24) {
    // Only verify on add liquidity (positive delta), allow remove always
    if (liquidityDelta > 0) {
      _accessListVerifyAddLiquidity(_getPool());
    }
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override onlyPool returns (bytes4) {
    _accessListVerifyFlash(_getPool());
    return IAlgebraPlugin.beforeFlash.selector;
  }

  // ###### Authorization ######

  /// @dev Authorization check for AccessListConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
