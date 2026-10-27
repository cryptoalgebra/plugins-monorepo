// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.26;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraDynamicFeePlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';
import '../MevxConnector.sol';

/// @dev Composes the connector the way the shipped plugins do, with the pool fee as the base fee
contract MevxPluginTest is UpgradeableAbstractPlugin, MevxConnector, IAlgebraDynamicFeePlugin {
  constructor(
    address _factory,
    address _pluginFactory,
    address _mevxImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) MevxConnector(_mevxImplementation) {}

  function initialize(address router, address executor, address distributor, bytes32 configId) external initializer onlyPluginFactory {
    _initializeMevx(router, executor, distributor, configId);
  }

  function getActiveModuleNames() external pure override returns (string[] memory moduleNames) {
    moduleNames = new string[](1);
    moduleNames[0] = MEVX_MODULE_NAME;
  }

  function defaultPluginConfig() public pure override returns (uint16) {
    return MEVX_PLUGIN_CONFIG;
  }

  function _getPool() internal view override(UpgradeableAbstractPlugin, MevxConnector) returns (address) {
    return UpgradeableAbstractPlugin._getPool();
  }

  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    UpgradeableAbstractPlugin._authorize();
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig());
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160 sqrtPriceX96, int24) external override onlyPool returns (bytes4) {
    _initializePool(msg.sender, sqrtPriceX96);
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeSwap(
    address sender,
    address,
    bool,
    int256 amountRequired,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (uint256, bytes4, uint24) {
    uint16 fee = _poolFee();
    // The executor swap pays no MEV protection fee
    uint24 rate = _isMevxExecutor(sender) ? 0 : _getMevxPluginFee(fee);
    return (_mevxBeforeSwap(amountRequired, rate), IAlgebraPlugin.beforeSwap.selector, fee);
  }

  function afterSwapCalculation(
    address,
    address,
    bool zeroToOne,
    int256,
    uint160,
    int256 amount0,
    int256 amount1,
    bytes memory
  ) external override onlyPool returns (bytes4, uint256, uint256) {
    return (IAlgebraPlugin.afterSwapCalculation.selector, _mevxAfterSwapCalculation(zeroToOne, amount0, amount1), 0);
  }

  function afterSwap(
    address sender,
    address recipient,
    bool zeroToOne,
    int256,
    uint160,
    int256 amount0,
    int256 amount1,
    uint256,
    bytes calldata
  ) external override onlyPool returns (bytes4) {
    _distributeMevxFee(zeroToOne);
    if (getMevxExecutor() != address(0)) _mevxAfterSwap(msg.sender, sender, recipient, zeroToOne, amount0, amount1);
    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @inheritdoc IAlgebraDynamicFeePlugin
  /// @dev The MEV protection fee is an amount delta, not a part of the swap fee
  function getSwapFee(address, address, bool, int256, uint160, bool, bytes calldata) external view override returns (uint24) {
    return _poolFee();
  }

  function _poolFee() private view returns (uint16 fee) {
    (, , fee, ) = _getPoolState();
  }
}
