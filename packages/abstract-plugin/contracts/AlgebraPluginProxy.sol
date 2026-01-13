// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';

/// @title Algebra Plugin Beacon Proxy
/// @notice BeaconProxy for Algebra Plugin - delegates calls to implementation from beacon
contract AlgebraPluginProxy is BeaconProxy {
  address public immutable pool;

  constructor(address beacon, address _pool, bytes memory data) BeaconProxy(beacon, data) {
    pool = _pool;
  }
}
