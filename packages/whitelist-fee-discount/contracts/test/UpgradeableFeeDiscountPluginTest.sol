// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../FeeDiscountConnector.sol';

/// @title Upgradeable FeeDiscount Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with FeeDiscount connector
contract UpgradeableFeeDiscountPluginTest is UpgradeableAbstractPlugin, FeeDiscountConnector, IAlgebraDynamicFeePlugin {
  using Plugins for uint16;

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
    _initializeFeeDiscount(_feeDiscountRegistry);
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = FEE_DISCOUNT_MODULE_NAME;
  }

  /// @dev Core needs DYNAMIC_FEE for a fee override
  /// @dev Shipped plugins get it from a fee module, this harness has none
  function defaultPluginConfig() public view override returns (uint16) {
    return FEE_DISCOUNT_PLUGIN_CONFIG | uint16(Plugins.DYNAMIC_FEE);
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
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
  ) external override onlyPool returns (uint256, bytes4, uint24) {
    (, , uint16 fee, ) = _getPoolState();
    uint24 discountedFee = _applyFeeDiscount(sender, _getPool(), fee);
    return (0, IAlgebraPlugin.beforeSwap.selector, discountedFee);
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  /// @dev The discount is keyed by sender, so the quote is for the address that will call the pool
  function getSwapFee(address sender, address, bool, int256, uint160, bool, bytes calldata) external view override returns (uint24) {
    (, , uint16 fee, ) = _getPoolState();
    return _quoteFeeDiscount(sender, _getPool(), fee);
  }

  // ###### Authorization ######

  /// @dev Authorization check for FeeDiscountConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
