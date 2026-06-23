// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IPriceConvergencePluginImplementation.sol';
import './libraries/PriceConvergenceStorage.sol';

/// @title Price Convergence Plugin Implementation
/// @notice Price convergence module logic using namespaced storage.
/// @dev Executed via delegatecall from PriceConvergenceConnector.
contract PriceConvergencePluginImplementation is IPriceConvergencePluginImplementation {
  /// @inheritdoc IPriceConvergencePluginImplementation
  function setVault(address _vault) external {
    require(_vault != address(0), 'Vault must be non zero');
    PriceConvergenceStorage.layout().vault = _vault;
  }
}
