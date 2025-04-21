// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../DefaultAlmPlugin.sol';

contract MockDefaultAlmPlugin is DefaultAlmPlugin {

  // Monday, October 5, 2020 9:00:00 AM GMT-05:00
  uint256 public time = 1601906400;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    AlgebraFeeConfiguration memory _config
  ) DefaultAlmPlugin(_pool, _factory, _pluginFactory, _config) {}

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function _blockTimestamp() internal view override returns (uint32) {
    return uint32(time);
  }
}
