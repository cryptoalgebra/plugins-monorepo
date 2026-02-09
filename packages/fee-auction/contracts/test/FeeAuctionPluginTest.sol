// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '../FeeAuctionConnector.sol';

contract FeeAuctionPluginTest is UpgradeableAbstractPlugin, FeeAuctionConnector {

  event PluginInitialized(address indexed pool);

  constructor(
    address _factory,
    address _pluginFactory,
    address _feeAuctionImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) FeeAuctionConnector(_feeAuctionImplementation) {}

  function initialize(
    uint24 _baseFee,
    uint24 _mevTaxMultiplier,
    uint24 _maxMevTax,
    bool _mevTaxEnabled
  ) external initializer {
    _authorize();
    _initializeFeeAuction(_baseFee, _mevTaxMultiplier, _maxMevTax, _mevTaxEnabled);
    emit PluginInitialized(_getPool());
  }

  /// @inheritdoc IAbstractPlugin
  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = FEE_AUCTION_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint8) {
    return FEE_AUCTION_PLUGIN_CONFIG;
  }


  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  /// @inheritdoc IAlgebraPlugin
  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    uint24 feeOverride = FeeAuctionStorage.layout().baseFee;
    uint24 pluginFee = _getAuctionFee();
    return (IAlgebraPlugin.beforeSwap.selector, feeOverride, pluginFee);
  }


  function getFeeAuctionImplementation() external view returns (address) {
    return feeAuctionImplementation;
  }
}
