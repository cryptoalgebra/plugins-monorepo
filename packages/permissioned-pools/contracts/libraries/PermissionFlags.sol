// SPDX-License-Identifier: MIT
// solhint-disable-next-line compiler-version
pragma solidity ^0.8.0;

/// @dev Vendored from Uniswap v4-periphery (src/hooks/permissionedPools/libraries/PermissionFlags.sol)
/// https://github.com/Uniswap/v4-periphery/blob/main/src/hooks/permissionedPools/libraries/PermissionFlags.sol
type PermissionFlag is bytes2;

using { or as | } for PermissionFlag global;
using { and as & } for PermissionFlag global;
using { eq as == } for PermissionFlag global;

function or(PermissionFlag a, PermissionFlag b) pure returns (PermissionFlag) {
  return PermissionFlag.wrap(PermissionFlag.unwrap(a) | PermissionFlag.unwrap(b));
}

function and(PermissionFlag a, PermissionFlag b) pure returns (PermissionFlag) {
  return PermissionFlag.wrap(PermissionFlag.unwrap(a) & PermissionFlag.unwrap(b));
}

function eq(PermissionFlag a, PermissionFlag b) pure returns (bool) {
  return PermissionFlag.unwrap(a) == PermissionFlag.unwrap(b);
}

library PermissionFlags {
  PermissionFlag internal constant NONE = PermissionFlag.wrap(0x0000);
  PermissionFlag internal constant SWAP_ALLOWED = PermissionFlag.wrap(0x0001);
  PermissionFlag internal constant LIQUIDITY_ALLOWED = PermissionFlag.wrap(0x0002);
  PermissionFlag internal constant ALL_ALLOWED = PermissionFlag.wrap(0xFFFF);
}
