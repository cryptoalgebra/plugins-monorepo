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

    emit PluginInitialized(_pool);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = ALM_MODULE_NAME;
  }

  function defaultPluginConfig() public view override returns (uint8) {
    return ALM_PLUGIN_CONFIG;
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
