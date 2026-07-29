// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IDualPoolPluginImplementation {
  error AlreadyInitialized();
  error VaultAssetMismatch();

  function initializeDualPool(address vault0, address vault1, address token0, address token1) external;
}
