// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '../PriceConvergenceConnector.sol';

/// @title Upgradeable Price Convergence Plugin Test
/// @notice Test contract that wires PriceConvergenceConnector into the Algebra plugin hook surface.
contract UpgradeablePriceConvergencePluginTest is UpgradeableAbstractPlugin, PriceConvergenceConnector {
  event PluginInitialized(address indexed pool);

  constructor(
    address _factory,
    address _pluginFactory,
    address _priceConvergenceImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) PriceConvergenceConnector(_priceConvergenceImplementation) {}

  function initialize() external initializer {
    _authorize();
    emit PluginInitialized(_getPool());
  }

  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = PRICE_CONVERGENCE_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return PRICE_CONVERGENCE_PLUGIN_CONFIG;
  }

  function beforeModifyPosition(
    address sender,
    address,
    int24,
    int24,
    int128,
    bytes calldata
  ) external view override onlyPool returns (bytes4, uint24) {
    _checkModifyPositionCaller(sender);
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  function _getFactory() internal view override returns (address) {
    return factory;
  }

  function _getPool() internal view override(UpgradeableAbstractPlugin, PriceConvergenceConnector) returns (address) {
    return UpgradeableAbstractPlugin._getPool();
  }

  function getPriceConvergenceImplementation() external view returns (address) {
    return priceConvergenceImplementation;
  }
}
