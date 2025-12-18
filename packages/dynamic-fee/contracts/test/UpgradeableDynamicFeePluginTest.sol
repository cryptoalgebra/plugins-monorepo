// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';
import '../DynamicFeeConnector.sol';

/// @title Upgradeable DynamicFee Plugin Test
/// @notice Test contract that uses DynamicFeeConnector with Beacon Proxy pattern
/// @dev Uses delegatecall to DynamicFeePluginImplementation for all DynamicFee logic
contract UpgradeableDynamicFeePluginTest is UpgradeableAbstractPlugin, DynamicFeeConnector {
  /// @dev Emitted when plugin is initialized
  event PluginInitialized(address indexed pool);

  constructor(
    address _factory,
    address _pluginFactory,
    address _dynamicFeeImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) DynamicFeeConnector(_dynamicFeeImplementation) {}

  /// @notice Initialize the plugin proxy
  /// @param _pool Pool address
  /// @param _config Fee configuration
  function initialize(address _pool, AlgebraFeeConfiguration memory _config) external initializer {
    _authorize();

    _initializeDynamicFee(_config);

    activeModules.push('DynamicFee');
    defaultPluginConfig = DYNAMIC_FEE_PLUGIN_CONFIG;

    emit PluginInitialized(_pool);
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  /// @dev Returns baseFee for testing purposes. Real implementation should calculate from volatility.
  function getCurrentFee() external view override returns (uint16 fee) {
    // For testing, just return baseFee (last element of tuple)
    // Real implementation would get volatility from oracle and calculate dynamic fee
    return 100; // Default baseFee
  }

  /// @dev Authorization - use real auth from UpgradeableAbstractPlugin
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @notice Get DynamicFee implementation address (for testing)
  function getDynamicFeeImplementation() external view returns (address) {
    return dynamicFeeImplementation;
  }
}
