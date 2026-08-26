// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title IAllowlistCheckerRegistry
/// @notice Governance-controlled registry of per-token IAllowlistChecker implementations.
/// @dev Setting a checker for a token is the governance approval. No separate register/verify step.
/// Only PERMISSIONED_POOL_MANAGER may point a token at a checker.
/// Trusted routers are not tracked here. That lives on each pool's plugin instead.
interface IAllowlistCheckerRegistry {
  event CheckerUpdated(address indexed token, address indexed checker);

  /// @notice The Algebra factory used for role-based access control
  function algebraFactory() external view returns (address);

  /// @notice Returns the checker governance has set for `token`, or address(0) if none
  function getChecker(address token) external view returns (address);

  /// @notice Set (or clear, with address(0)) the checker for `token`
  /// @dev Reverts unless `checker` supports IAllowlistChecker via ERC-165, or is address(0)
  function setChecker(address token, address checker) external;
}
