// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import { ERC165 } from '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '../../interfaces/IAllowlistChecker.sol';
import '../../libraries/PermissionFlags.sol';

/// @title Mock Allowlist Checker
/// @notice Test checker with directly settable per-account flags, for testing the plugin logic
/// without pulling in a real eligibility source like OnchainID.
contract MockAllowlistChecker is IAllowlistChecker, ERC165 {
  mapping(address => PermissionFlag) public flags;

  function setFlags(address account, PermissionFlag flag) external {
    flags[account] = flag;
  }

  /// @dev The realistic grant composes the two operation flags instead of 0xFFFF
  /// @dev It is also the only caller of the library's | operator
  function grantSwapAndLiquidity(address account) external {
    flags[account] = PermissionFlags.SWAP_ALLOWED | PermissionFlags.LIQUIDITY_ALLOWED;
  }

  /// @inheritdoc IAllowlistChecker
  function checkAllowlist(address account, address) external view override returns (PermissionFlag) {
    return flags[account];
  }

  /// @inheritdoc IERC165
  function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
    return interfaceId == type(IAllowlistChecker).interfaceId || super.supportsInterface(interfaceId);
  }
}
