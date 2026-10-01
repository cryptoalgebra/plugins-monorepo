// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../StablePairFeeConnector.sol';

/// @title Upgradeable Stable Pair Fee Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with StablePairFee connector
contract StablePairFeePluginTest is UpgradeableAbstractPlugin, StablePairFeeConnector {
  constructor(
    address _factory,
    address _pluginFactory,
    address _stablePairFeeImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) StablePairFeeConnector(_stablePairFeeImplementation) {}

  function initialize() external initializer onlyPluginFactory {}

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = STABLE_PAIR_FEE_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return STABLE_PAIR_FEE_PLUGIN_CONFIG;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function beforeSwap(
    address,
    address,
    bool zeroToOne,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    (uint160 price, , , ) = _getPoolState();
    uint24 fee = _getStableFeeAndUpdateState(zeroToOne, price);
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }

  // ###### Authorization ######

  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }
}
