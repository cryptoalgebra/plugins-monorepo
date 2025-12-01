// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '../AlmConnector.sol';

/// @title Upgradeable ALM Plugin Test
/// @notice Test contract that uses AlmConnector with Beacon Proxy pattern
/// @dev Uses delegatecall to AlmPluginImplementation for all ALM logic
contract UpgradeableAlmPluginTest is UpgradeableAbstractPlugin, AlmConnector {
  /// @dev Emitted when plugin is initialized
  event PluginInitialized(address indexed pool, address rebalanceManager);

  constructor(
    address _factory,
    address _pluginFactory,
    address _almImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) AlmConnector(_almImplementation) {}

  /// @notice Initialize the plugin proxy
  /// @param _pool Pool address
  /// @param _rebalanceManager Rebalance manager address
  /// @param _slowTwapPeriod Slow TWAP period in seconds
  /// @param _fastTwapPeriod Fast TWAP period in seconds
  function initialize(
    address _pool,
    address _rebalanceManager,
    uint32 _slowTwapPeriod,
    uint32 _fastTwapPeriod
  ) external initializer {
    _authorize();
    __UpgradeableAbstractPlugin_init(_pool);

    _initializeAlm(_rebalanceManager, _slowTwapPeriod, _fastTwapPeriod);

    activeModules.push('ALM');
    defaultPluginConfig = ALM_PLUGIN_CONFIG;

    emit PluginInitialized(_pool, _rebalanceManager);
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
