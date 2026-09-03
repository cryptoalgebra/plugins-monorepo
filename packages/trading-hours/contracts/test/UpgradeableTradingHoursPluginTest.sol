// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../TradingHoursConnector.sol';
import '../interfaces/ITradingHoursPlugin.sol';

/// @title Upgradeable Trading Hours Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with Trading Hours connector
contract UpgradeableTradingHoursPluginTest is UpgradeableAbstractPlugin, TradingHoursConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _tradingHoursImplementation The Trading Hours implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _tradingHoursImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) TradingHoursConnector(_tradingHoursImplementation) {}

  function initialize(
    address,
    uint32 tradingStartSeconds,
    uint32 tradingEndSeconds,
    int32 weekendOffsetSeconds,
    bool enabled
  ) external initializer onlyPluginFactory {
    _initializeTradingHours(tradingStartSeconds, tradingEndSeconds, weekendOffsetSeconds, enabled);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = TRADING_HOURS_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return TRADING_HOURS_PLUGIN_CONFIG;
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
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    _verifyTrading();
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  // ###### Authorization ######

  /// @dev Authorization check for TradingHoursConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
