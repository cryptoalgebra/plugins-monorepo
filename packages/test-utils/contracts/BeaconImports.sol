// SPDX-License-Identifier: MIT
pragma solidity =0.8.20;

// Re-export OpenZeppelin beacon proxy contracts for testing
// Import these from @cryptoalgebra/test-utils instead of duplicating

import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import { BeaconProxy } from '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';
