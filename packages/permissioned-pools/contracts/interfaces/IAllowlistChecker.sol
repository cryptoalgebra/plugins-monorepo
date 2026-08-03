// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import { PermissionFlag } from '../libraries/PermissionFlags.sol';

/// @dev Vendored from Uniswap v4-periphery (src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol)
/// https://github.com/Uniswap/v4-periphery/blob/main/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol
interface IAllowlistChecker is IERC165 {
  /// @notice Returns the permission flags for `account` with respect to `tokenAddress`
  /// @param account The account whose allowlist status is being checked
  /// @param tokenAddress The permissioned token the check is being made for
  /// @dev `tokenAddress` lets a single allowlist checker serve multiple assets without an extra round-trip into the registry
  function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag);
}
