// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';
import '@openzeppelin/contracts/proxy/beacon/IBeacon.sol';

/// @title Algebra Plugin Beacon Proxy
/// @notice BeaconProxy for Algebra Plugin - delegates calls to implementation from beacon
contract AlgebraPluginProxy is BeaconProxy {
  address immutable public pool;

  constructor(address beacon, address _pool, bytes memory data) BeaconProxy(beacon, data) {
    pool = _pool;
  }
}
