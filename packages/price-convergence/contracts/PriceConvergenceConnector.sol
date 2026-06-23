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
  function setVault(address _vault) external override {
    _authorize();
    _delegateCall(priceConvergenceImplementation, abi.encodeCall(IPriceConvergencePluginImplementation.setVault, (_vault)));
    emit Vault(_vault);
  }

  /// @inheritdoc IPriceConvergencePlugin
  function vault() external view override returns (address) {
    return PriceConvergenceStorage.layout().vault;
  }
}
