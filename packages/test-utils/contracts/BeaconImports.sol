// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

// Re-export OpenZeppelin beacon proxy contracts for testing
// Import these from @cryptoalgebra/test-utils instead of duplicating

// The imports make hardhat compile both artifacts
// solhint-disable no-unused-import
import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import { BeaconProxy } from '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';
