// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IMevxPluginImplementation.sol';
import './interfaces/IMevxPlugin.sol';
import './interfaces/IMevxRouter.sol';
import './libraries/MevxStorage.sol';

/// @title MEVX Connector
/// @notice This contract provides delegatecall interface to MEVX plugin implementation
/// @dev Provides thin wrappers that delegate to implementation via delegatecall
abstract contract MevxConnector is BaseConnector, IMevxPlugin {
  using Plugins for uint8;

  string internal constant MEVX_MODULE_NAME = 'MEVX Plugin';
  uint8 internal constant MEVX_PLUGIN_CONFIG = uint8(Plugins.AFTER_INIT_FLAG | Plugins.AFTER_SWAP_FLAG | Plugins.BEFORE_SWAP_FLAG | Plugins.DYNAMIC_FEE);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable mevxImplementation;

  constructor(address _mevxImplementation) {
    mevxImplementation = _mevxImplementation;
  }

  /// @dev Must be implemented by the concrete plugin to return the associated pool address
  function _getPool() internal view virtual returns (address);

  /// @notice Initialize MEVX plugin via delegatecall
  function _initializeMevx(address _router, address _executor, address _distributor, bytes32 _configId, uint16 _defaultFee) internal {
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.initializeMevx, (_router, _executor, _distributor, _configId, _defaultFee)));
  }

  function _initializePool(address pool, uint160 sqrtPriceX96) internal {
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.initializePool, (pool, sqrtPriceX96)));
  }

  /// @notice Execute mevx after swap via delegatecall
  function _mevxAfterSwap(
    address pool,
    address sender,
    address recipient,
    bool zeroToOne,
    int256 amount0,
    int256 amount1
  ) internal {
    _delegateCall(
      mevxImplementation,
      abi.encodeCall(IMevxPluginImplementation.mevxAfterSwap, (pool, sender, recipient, zeroToOne, amount0, amount1))
    );
  }

  /// @notice Self-call entry point used to cap the gas spent by route construction and execution
  function runArbitrage(
    bytes32 poolId,
    bool zeroToOne,
    int256 amount0,
    int256 amount1,
    address sender,
    address recipient
  ) external {
    _delegateCall(
      mevxImplementation,
      abi.encodeCall(IMevxPluginImplementation.runArbitrage, (poolId, zeroToOne, amount0, amount1, sender, recipient))
    );
  }

  /// @notice Internal helper for MEVX plugin fee distribution
  /// @dev Call from the concrete plugin's handlePluginFee override.
  ///      Auth (onlyPool / authorized callers) must be enforced by the caller.
  /// @param pluginFee0 Amount of token0 fees to distribute
  /// @param pluginFee1 Amount of token1 fees to distribute
  function _handleMevxPluginFee(uint256 pluginFee0, uint256 pluginFee1) internal {
    if (pluginFee0 > 0 || pluginFee1 > 0) {
      _delegateCall(
        mevxImplementation,
        abi.encodeCall(IMevxPluginImplementation.handlePluginFee, (_getPool(), pluginFee0, pluginFee1))
      );
    }
  }

  /// @notice Returns true if `caller` is authorized to trigger handlePluginFee
  /// @dev The pool is always authorized; additional callers can be whitelisted via setAuthorizedHandlePluginFeeCaller
  function _isAuthorizedHandlePluginFeeCaller(address caller) internal view returns (bool) {
    return caller == _getPool() || MevxStorage.layout().authorizedHandlePluginFeeCallers[caller];
  }

  // ###### View Methods (Direct Storage Access) ######

  /// @notice Get mevx router
  function getMevxRouter() external view override returns (address) {
    return MevxStorage.layout().mevxRouter;
  }

  function getMevxExecutor() public view override returns (address) {
    return MevxStorage.layout().mevxExecutor;
  }

  function getProfitDistributor() external view override returns (address) {
    return MevxStorage.layout().mevxProfitDistributor;
  }

  /// @notice Get mevx config ID
  function getConfigId() external view override returns (bytes32) {
    return MevxStorage.layout().mevxConfigId;
  }

  function getMinGasLeft() external view override returns (uint256) {
    return MevxStorage.layout().minGasLeft;
  }

  function getCallGasBudget() external view override returns (uint256) {
    return MevxStorage.layout().callGasBudget;
  }

  function getDefaultFee() external view override returns (uint16) {
    return MevxStorage.layout().defaultFee;
  }

  function getMevProtectionFeeEnabled() external view override returns (bool) {
    return MevxStorage.layout().mevProtectionFeeEnabled;
  }

  /// @notice Returns the current total fee (defaultFee + MEV protection fee from router)
  /// @dev Queries the router via staticcall; falls back to defaultFee if the call fails
  function getCurrentFee() external view override returns (uint16) {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    uint16 currentFee = layout.defaultFee;
    address router = layout.mevxRouter;
    if (router == address(0)) return currentFee;

    (bool success, bytes memory returnData) = router.staticcall{gas: layout.callGasBudget}(
      abi.encodeWithSelector(IMevxRouter.getMevProtectionFee.selector, currentFee)
    );
    if (success && returnData.length == 32) {
      uint24 pluginFee = abi.decode(returnData, (uint24));
      uint256 total = uint256(currentFee) + pluginFee;
      if (total <= type(uint16).max) {
        return uint16(total);
      }
    }
    return currentFee;
  }

  // ###### Internal Helpers for beforeSwap ######

  /// @notice Returns true if sender is the MEVX executor (executor bypass for sandwich protection)
  function _isMevxExecutor(address sender) internal view returns (bool) {
    return sender == MevxStorage.layout().mevxExecutor;
  }

  /// @notice Returns the MEV protection plugin fee if enabled, or 0 otherwise
  /// @dev Queries the router via staticcall; fails silently and returns 0
  function _getMevxPluginFee() internal view returns (uint24 pluginFee) {
    MevxStorage.Layout storage layout = MevxStorage.layout();
    if (!layout.mevProtectionFeeEnabled) return 0;
    address router = layout.mevxRouter;
    if (router == address(0)) return 0;

    (bool success, bytes memory returnData) = router.staticcall{gas: layout.callGasBudget}(
      abi.encodeWithSelector(IMevxRouter.getMevProtectionFee.selector, layout.defaultFee)
    );
    if (success && returnData.length == 32) {
      pluginFee = abi.decode(returnData, (uint24));
      if (pluginFee > type(uint16).max) pluginFee = 0;
    }
  }

  // ###### Public Interface ######

  function setConfigId(bytes32 _configId) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setConfigId, (_configId)));
  }

  function setProfitDistributor(address _profitDistributor) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setProfitDistributor, (_profitDistributor)));
  }

  function setMevxExecutor(address _mevxExecutor) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setMevxExecutor, (_mevxExecutor)));
  }

  function setMevxRouter(address _mevxRouter) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setMevxRouter, (_mevxRouter)));
  }

  function setMinGasLeft(uint256 _minGasLeft) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setMinGasLeft, (_minGasLeft)));
  }

  function setCallGasBudget(uint256 _callGasBudget) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setCallGasBudget, (_callGasBudget)));
  }

  function setDefaultFee(uint16 _defaultFee) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setDefaultFee, (_defaultFee)));
  }

  function setMevProtectionFeeEnabled(bool _enabled) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setMevProtectionFeeEnabled, (_enabled)));
  }

  function setAuthorizedHandlePluginFeeCaller(address _caller, bool _authorized) external override {
    _authorize();
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.setAuthorizedHandlePluginFeeCaller, (_caller, _authorized)));
  }
}
