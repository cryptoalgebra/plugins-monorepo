// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../AlgebraUpgradeablePlugin.sol';

/// @title Mock upgradeable plugin for testing
/// @notice Used for testing time dependent behavior
contract MockTimeAlgebraUpgradeablePlugin is AlgebraUpgradeablePlugin {
  // Monday, October 5, 2020 9:00:00 AM GMT-05:00
  uint256 public time = 1601906400;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    address _farmingProxyImpl
  ) AlgebraUpgradeablePlugin(_pool, _factory, _pluginFactory, _farmingProxyImpl) {}

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function _blockTimestamp() internal view override returns (uint32) {
    return uint32(time);
  }

  function checkBlockTimestamp() external view returns (bool) {
    require(super._blockTimestamp() == uint32(block.timestamp));
    return true;
  }
}
