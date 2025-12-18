// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../FeeDiscountConnector.sol';

/// @title Upgradeable FeeDiscount Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with FeeDiscount connector
contract UpgradeableFeeDiscountPluginTest is UpgradeableAbstractPlugin, FeeDiscountConnector {
  using Plugins for uint8;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _feeDiscountImplementation The FeeDiscount implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _feeDiscountImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) FeeDiscountConnector(_feeDiscountImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  /// @param _pool The pool address this plugin is attached to
  /// @param _feeDiscountRegistry The fee discount registry address
  function initialize(address _pool, address _feeDiscountRegistry) external initializer onlyPluginFactory {

    (uint8 pluginConfig, string memory moduleName) = _initializeFeeDiscount(_feeDiscountRegistry);
    _setDefaultPluginConfig(_getDefaultPluginConfig() | pluginConfig);

    _appendActiveModule(moduleName);
  }

  // ###### HOOKS ######

  function beforeInitialize(
    address,
    uint160
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(_getDefaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function beforeSwap(
    address sender,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    (, , uint16 fee, ) = _getPoolState();
    uint24 discountedFee = _applyFeeDiscount(sender, _getPool(), fee);
    return (IAlgebraPlugin.beforeSwap.selector, discountedFee, 0);
  }

  // ###### Authorization ######

  /// @dev Authorization check for FeeDiscountConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
