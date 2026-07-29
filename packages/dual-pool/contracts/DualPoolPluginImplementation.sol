// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@openzeppelin/contracts/interfaces/IERC4626.sol';
import './libraries/DualPoolStorage.sol';
import './interfaces/IDualPoolPluginImplementation.sol';

contract DualPoolPluginImplementation is IDualPoolPluginImplementation {
  function initializeDualPool(address vault0, address vault1, address token0, address token1) external override {
    DualPoolStorage.Layout storage layout = DualPoolStorage.layout();
    if (layout.initialized) revert AlreadyInitialized();

    if (vault0 != address(0) && IERC4626(vault0).asset() != token0) revert VaultAssetMismatch();
    if (vault1 != address(0) && IERC4626(vault1).asset() != token1) revert VaultAssetMismatch();

    layout.vault0 = IERC4626(vault0);
    layout.vault1 = IERC4626(vault1);
    layout.initialized = true;
  }
}
