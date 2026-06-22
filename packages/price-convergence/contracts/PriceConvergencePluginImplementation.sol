// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IPriceConvergencePluginImplementation.sol';
import './interfaces/IPriceConvergenceVault.sol';
import './libraries/PriceConvergenceStorage.sol';

/// @title Price Convergence Plugin Implementation
/// @notice Price convergence module logic using namespaced storage.
/// @dev Executed via delegatecall from PriceConvergenceConnector.
contract PriceConvergencePluginImplementation is IPriceConvergencePluginImplementation {
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  /// @inheritdoc IPriceConvergencePluginImplementation
  function initializePriceConvergence(address _vault, address _rebalanceManager, int24 _positionWidth) external {
    _setVault(_vault);
    _setRebalanceManager(_rebalanceManager);
    _setPositionWidth(_positionWidth);
  }

  /// @inheritdoc IPriceConvergencePluginImplementation
  function setVault(address _vault) external {
    _setVault(_vault);
  }

  /// @inheritdoc IPriceConvergencePluginImplementation
  function setRebalanceManager(address _rebalanceManager) external {
    _setRebalanceManager(_rebalanceManager);
  }

  /// @inheritdoc IPriceConvergencePluginImplementation
  function setPositionWidth(int24 _positionWidth) external {
    _setPositionWidth(_positionWidth);
  }

  /// @inheritdoc IPriceConvergencePluginImplementation
  function rebalance(int256 swapQuantity, uint160 limitSqrtPrice, address algebraFactory) external {
    PriceConvergenceStorage.Layout storage layout = PriceConvergenceStorage.layout();
    bool allowed = msg.sender == layout.rebalanceManager ||
      IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender);
    require(allowed, 'Not allowed to rebalance');

    address _vault = layout.vault;
    require(_vault != address(0), 'Vault not set');

    IPriceConvergenceVault(_vault).rebalance(swapQuantity, limitSqrtPrice, layout.positionWidth);
  }

  function _setVault(address _vault) private {
    require(_vault != address(0), 'Vault must be non zero');
    PriceConvergenceStorage.layout().vault = _vault;
  }

  function _setRebalanceManager(address _rebalanceManager) private {
    PriceConvergenceStorage.layout().rebalanceManager = _rebalanceManager;
  }

  function _setPositionWidth(int24 _positionWidth) private {
    require(_positionWidth > 0, 'Position width must be positive');
    PriceConvergenceStorage.layout().positionWidth = _positionWidth;
  }
}
