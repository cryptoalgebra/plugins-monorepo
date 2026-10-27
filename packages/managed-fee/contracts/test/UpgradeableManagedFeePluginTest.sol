// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../ManagedFeeConnector.sol';

/// @title Upgradeable ManagedFee Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with ManagedFee connector
contract UpgradeableManagedFeePluginTest is UpgradeableAbstractPlugin, ManagedFeeConnector, IAlgebraDynamicFeePlugin {
  using Plugins for uint16;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _managedFeeImplementation The ManagedFee implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _managedFeeImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) ManagedFeeConnector(_managedFeeImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  function initialize() external initializer onlyPluginFactory {}

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = MANAGED_FEE_MODULE_NAME;
  }

  function defaultPluginConfig() public view override returns (uint16) {
    return MANAGED_FEE_PLUGIN_CONFIG;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata pluginData
  ) external override onlyPool returns (uint256, bytes4, uint24) {
    uint24 fee = pluginData.length > 0 ? _getManagedFee(pluginData) : _poolFee();
    return (0, IAlgebraPlugin.beforeSwap.selector, fee);
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  function getSwapFee(address, address, bool, int256, uint160, bool, bytes calldata pluginData) external view override returns (uint24) {
    return pluginData.length > 0 ? _quoteManagedFee(pluginData) : _poolFee();
  }

  /// @dev A swap without a signed fee pays the pool fee. With DYNAMIC_FEE a zero would make it free
  function _poolFee() private view returns (uint24) {
    (, , uint16 fee, ) = _getPoolState();
    return fee;
  }

  // ###### Authorization ######

  /// @dev Authorization check for ManagedFeeConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
