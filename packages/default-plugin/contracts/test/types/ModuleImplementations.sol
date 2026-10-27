// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @notice Addresses of the module implementations a composed plugin delegates to
/// @dev Test-side only, AlgebraUpgradeablePlugin keeps its positional arguments
/// @dev One struct, so a new module does not change every harness constructor
struct ModuleImplementations {
  address volatilityOracle;
  address dynamicFee;
  address farmingProxy;
  address alm;
  address security;
}
