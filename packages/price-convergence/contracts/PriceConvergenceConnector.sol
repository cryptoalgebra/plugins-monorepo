// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IPriceConvergencePlugin.sol';
import './interfaces/IPriceConvergencePluginImplementation.sol';
import './libraries/PriceConvergenceStorage.sol';

/// @title Price Convergence Connector
/// @notice Delegatecall interface for the Price Convergence plugin implementation.
abstract contract PriceConvergenceConnector is BaseConnector, IPriceConvergencePlugin {
  string internal constant PRICE_CONVERGENCE_MODULE_NAME = 'Price Convergence Plugin';
  uint8 internal constant PRICE_CONVERGENCE_PLUGIN_CONFIG = uint8(Plugins.BEFORE_POSITION_MODIFY_FLAG);

  address internal immutable priceConvergenceImplementation;

  constructor(address _priceConvergenceImplementation) {
    priceConvergenceImplementation = _priceConvergenceImplementation;
  }

  /// @notice Reverts unless a pool liquidity modification was initiated by the configured vault.
  function _checkModifyPositionCaller(address caller) internal view {
    if (caller != PriceConvergenceStorage.layout().vault) revert OnlyVault();
  }

  /// @inheritdoc IPriceConvergencePlugin
  function initializePriceConvergence(address _vault, address _rebalanceManager, int24 _positionWidth) external override {
    _authorize();
    _delegateCall(
      priceConvergenceImplementation,
      abi.encodeCall(IPriceConvergencePluginImplementation.initializePriceConvergence, (_vault, _rebalanceManager, _positionWidth))
    );
    emit PriceConvergenceInitialized(_vault, _rebalanceManager, _positionWidth);
  }

  /// @inheritdoc IPriceConvergencePlugin
  function setVault(address _vault) external override {
    _authorize();
    _delegateCall(priceConvergenceImplementation, abi.encodeCall(IPriceConvergencePluginImplementation.setVault, (_vault)));
    emit Vault(_vault);
  }

  /// @inheritdoc IPriceConvergencePlugin
  function setRebalanceManager(address _rebalanceManager) external override {
    _authorize();
    _delegateCall(
      priceConvergenceImplementation,
      abi.encodeCall(IPriceConvergencePluginImplementation.setRebalanceManager, (_rebalanceManager))
    );
    emit RebalanceManager(_rebalanceManager);
  }

  /// @inheritdoc IPriceConvergencePlugin
  function setPositionWidth(int24 _positionWidth) external override {
    _authorize();
    _delegateCall(priceConvergenceImplementation, abi.encodeCall(IPriceConvergencePluginImplementation.setPositionWidth, (_positionWidth)));
    emit PositionWidth(_positionWidth);
  }

  /// @inheritdoc IPriceConvergencePlugin
  function rebalance(int256 swapQuantity, uint160 limitSqrtPrice) external override {
    _delegateCall(
      priceConvergenceImplementation,
      abi.encodeCall(IPriceConvergencePluginImplementation.rebalance, (swapQuantity, limitSqrtPrice, _getFactory()))
    );
  }

  /// @inheritdoc IPriceConvergencePlugin
  function vault() external view override returns (address) {
    return PriceConvergenceStorage.layout().vault;
  }

  /// @inheritdoc IPriceConvergencePlugin
  function rebalanceManager() external view override returns (address) {
    return PriceConvergenceStorage.layout().rebalanceManager;
  }

  /// @inheritdoc IPriceConvergencePlugin
  function positionWidth() external view override returns (int24) {
    return PriceConvergenceStorage.layout().positionWidth;
  }

  /// @inheritdoc IPriceConvergencePlugin
  function getPool() external view virtual override returns (address) {
    return _getPool();
  }

  /// @dev Must be implemented by the inheriting plugin to expose Algebra factory address.
  function _getFactory() internal view virtual returns (address);

  /// @dev Must be implemented by the inheriting plugin to expose pool address.
  function _getPool() internal view virtual returns (address);
}
