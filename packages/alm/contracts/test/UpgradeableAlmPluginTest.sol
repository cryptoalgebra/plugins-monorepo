// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '../AlmConnector.sol';

/// @title Upgradeable ALM Plugin Test
/// @notice Test contract that uses AlmConnector with Beacon Proxy pattern
/// @dev Uses delegatecall to AlmPluginImplementation for all ALM logic
contract UpgradeableAlmPluginTest is UpgradeableAbstractPlugin, AlmConnector {
  /// @dev Emitted when plugin is initialized
  event PluginInitialized(address indexed pool);

  constructor(
    address _factory,
    address _pluginFactory,
    address _almImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) AlmConnector(_almImplementation) {}

  /// @notice Initialize the plugin proxy
  /// @param _pool Pool address (for test ergonomics only; real pool is read from proxy bytecode)
  function initialize(address _pool) external initializer {
    _authorize();

    (uint8 pluginConfig, string memory moduleName) = _initializeAlm();

    _appendActiveModule(moduleName);
    _setDefaultPluginConfig(pluginConfig);

    emit PluginInitialized(_pool);
  }

  /// @dev Authorization - use real auth from UpgradeableAbstractPlugin
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @notice Get ALM implementation address (for testing)
  function getAlmImplementation() external view returns (address) {
    return almImplementation;
  }
}
