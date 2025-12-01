// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../interfaces/IFarmingPluginFactory.sol';

/// @title Mock Plugin Factory for FarmingProxy testing
contract MockPluginFactory is IFarmingPluginFactory {
  address public override farmingAddress;

  constructor(address _farmingAddress) {
    farmingAddress = _farmingAddress;
  }

  function setFarmingAddress(address newFarmingAddress) external override {
    farmingAddress = newFarmingAddress;
    emit FarmingAddress(newFarmingAddress);
  }
}
