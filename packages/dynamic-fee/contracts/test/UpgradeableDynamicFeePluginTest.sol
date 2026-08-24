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

    emit PluginInitialized(_pool);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = DYNAMIC_FEE_MODULE_NAME;
  }

  function defaultPluginConfig() public view override returns (uint8) {
    return DYNAMIC_FEE_PLUGIN_CONFIG;
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  /// @dev There is no oracle in this harness, so the fee is quoted at zero volatility
  function getCurrentFee() external view override returns (uint16 fee) {
    return _getCurrentFee(0);
  }

  /// @notice Reaches the connector's fee formula at a chosen volatility
  /// @dev The connector recomputes the formula instead of delegating, so it needs its own coverage
  function getCurrentFeeForVolatility(uint88 volatilityAverage) external view returns (uint16 fee) {
    return _getCurrentFee(volatilityAverage);
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
