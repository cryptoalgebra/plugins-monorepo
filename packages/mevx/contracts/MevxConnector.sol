// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IMevxPluginImplementation.sol';
import './interfaces/IMevxPlugin.sol';
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

  /// @notice Initialize MEVX plugin via delegatecall
  function _initializeMevx(address _router, address _executor, address _distributor, bytes32 _configId) internal {
    _delegateCall(mevxImplementation, abi.encodeCall(IMevxPluginImplementation.initializeMevx, (_router, _executor, _distributor, _configId)));
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
}
