// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol' as OZUpgradeableBeacon;

/// @title UpgradeableBeacon wrapper for testing
/// @notice Re-exports OpenZeppelin UpgradeableBeacon for test contracts
contract UpgradeableBeacon is OZUpgradeableBeacon.UpgradeableBeacon {
  constructor(address implementation_) OZUpgradeableBeacon.UpgradeableBeacon(implementation_) {}
}
