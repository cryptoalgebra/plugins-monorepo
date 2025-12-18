// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '../FarmingProxyConnector.sol';

/// @title Upgradeable FarmingProxy Plugin Test
/// @notice Test contract that uses FarmingProxyConnector with Beacon Proxy pattern
/// @dev Uses delegatecall to FarmingProxyPluginImplementation for all FarmingProxy logic
contract UpgradeableFarmingProxyPluginTest is UpgradeableAbstractPlugin, FarmingProxyConnector {
  /// @dev Emitted when plugin is initialized
  event PluginInitialized(address indexed pool);

  constructor(
    address _factory,
    address _pluginFactory,
    address _farmingProxyImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) FarmingProxyConnector(_farmingProxyImplementation) {}

  /// @notice Initialize the plugin proxy
  /// @param _pool Pool address
  function initialize(address _pool) external initializer {
    _authorize();

    _initializeFarmingProxy();

    _appendActiveModule('FarmingProxy');
    _setDefaultPluginConfig(FARMING_PROXY_PLUGIN_CONFIG);

    emit PluginInitialized(_pool);
  }

  /// @dev Authorization - use real auth from UpgradeableAbstractPlugin
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @inheritdoc FarmingProxyConnector
  function _getPluginFactory() internal view override returns (address) {
    return pluginFactory;
  }

  /// @inheritdoc FarmingProxyConnector
  function _getPool() internal view override returns (address) {
    return UpgradeableAbstractPlugin._getPool();
  }

  /// @notice Get FarmingProxy implementation address (for testing)
  function getFarmingProxyImplementation() external view returns (address) {
    return farmingProxyImplementation;
  }
}
