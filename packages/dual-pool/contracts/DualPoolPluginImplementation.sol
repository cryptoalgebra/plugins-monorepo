// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './libraries/DualPoolStorage.sol';
import './interfaces/IDualPoolPluginImplementation.sol';
import './DualPoolManager.sol';

contract DualPoolPluginImplementation is IDualPoolPluginImplementation {
  function setDualPoolManager(address _dualPoolManager) external override {
    DualPoolStorage.Layout storage layout = DualPoolStorage.layout();
    if (address(layout.dualPoolManager) != address(0)) revert DualPoolManagerAlreadySet();
    layout.dualPoolManager = DualPoolManager(_dualPoolManager);
  }
}
