// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol' as OZBeaconProxy;

/// @title BeaconProxy wrapper for testing
/// @notice Re-exports OpenZeppelin BeaconProxy for test contracts
contract BeaconProxy is OZBeaconProxy.BeaconProxy {
  constructor(address beacon, bytes memory data) OZBeaconProxy.BeaconProxy(beacon, data) {}
}
