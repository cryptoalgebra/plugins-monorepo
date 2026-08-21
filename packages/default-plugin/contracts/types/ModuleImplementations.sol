// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @notice Addresses of the module implementations a composed plugin delegates to
/// @dev Passed as one struct so adding a module does not change every constructor and deploy script
struct ModuleImplementations {
  address volatilityOracle;
  address dynamicFee;
  address farmingProxy;
  address alm;
  address security;
}
