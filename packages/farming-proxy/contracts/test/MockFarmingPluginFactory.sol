// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/test-utils/contracts/MockPluginFactory.sol';

/// @title Mock Farming Plugin Factory for FarmingProxy tests
/// @dev Extends MockPluginFactory with farmingAddress for incentive authorization
contract MockFarmingPluginFactory is MockPluginFactory {
  address public farmingAddress;

  constructor(address _farmingAddress) {
    farmingAddress = _farmingAddress;
  }

  function setFarmingAddress(address _farmingAddress) external {
    farmingAddress = _farmingAddress;
  }
}
