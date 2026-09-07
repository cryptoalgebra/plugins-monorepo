// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import '../interfaces/IAllowlistChecker.sol';
import '../libraries/PermissionFlags.sol';

/// @title Test Permissioned ERC20
/// @notice Demo token that gates its own transfers through the same IAllowlistChecker the pool uses.
/// @dev Both sides of a transfer are checked, mirroring how a permissioned RWA token behaves. Because
/// a swap moves tokens to and from the pool, the pool and every router must be exempt (or hold the
/// credential themselves) or trading will revert — see `setExempt`.
/// Test scaffolding only: ownership is a plain EOA and minting is unrestricted for the owner.
contract TestPermissionedERC20 is ERC20, Ownable {
  /// @notice The account is missing the permissions this token requires
  error TransferNotAllowed(address account);

  event CheckerUpdated(address indexed checker);
  event RequiredFlagUpdated(PermissionFlag requiredFlag);
  event ExemptUpdated(address indexed account, bool exempt);

  /// @notice The allowlist checker consulted on every transfer; when unset the token is unrestricted
  IAllowlistChecker public checker;

  /// @notice The permissions an account must hold to send or receive this token
  PermissionFlag public requiredFlag;

  /// @notice Accounts that bypass the check entirely, such as pools, routers and the treasury
  mapping(address account => bool exempt) public isExempt;

  constructor(string memory name_, string memory symbol_, address checker_) ERC20(name_, symbol_) {
    checker = IAllowlistChecker(checker_);
    requiredFlag = PermissionFlags.SWAP_ALLOWED;
    isExempt[msg.sender] = true;
    emit CheckerUpdated(checker_);
    emit ExemptUpdated(msg.sender, true);
  }

  /// @notice Whether `account` may currently send or receive this token
  /// @dev Exposed for front ends so they can explain a rejection before submitting a transaction
  function isAllowed(address account) public view returns (bool) {
    if (address(checker) == address(0) || isExempt[account]) return true;
    PermissionFlag flags = checker.checkAllowlist(account, address(this));
    return (flags & requiredFlag) == requiredFlag;
  }

  /// @notice Point the token at a different checker, or at address(0) to lift all restrictions
  function setChecker(address newChecker) external onlyOwner {
    checker = IAllowlistChecker(newChecker);
    emit CheckerUpdated(newChecker);
  }

  /// @notice Change which permissions this token demands, e.g. to also require LIQUIDITY_ALLOWED
  function setRequiredFlag(PermissionFlag newRequiredFlag) external onlyOwner {
    requiredFlag = newRequiredFlag;
    emit RequiredFlagUpdated(newRequiredFlag);
  }

  /// @notice Exempt an address from the check; needed for the pool and every router that trades this token
  function setExempt(address account, bool exempt) external onlyOwner {
    isExempt[account] = exempt;
    emit ExemptUpdated(account, exempt);
  }

  /// @notice Exempt several addresses at once
  function setExemptBatch(address[] calldata accounts, bool exempt) external onlyOwner {
    for (uint256 i; i < accounts.length; ++i) {
      isExempt[accounts[i]] = exempt;
      emit ExemptUpdated(accounts[i], exempt);
    }
  }

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }

  function burn(uint256 amount) external {
    _burn(msg.sender, amount);
  }

  /// @dev The zero address is skipped so minting and burning are never gated on a counterparty that
  /// cannot hold a credential; the real counterparty of a mint or burn is still checked.
  function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
    super._beforeTokenTransfer(from, to, amount);
    if (address(checker) == address(0)) return;

    if (from != address(0) && !isAllowed(from)) revert TransferNotAllowed(from);
    if (to != address(0) && !isAllowed(to)) revert TransferNotAllowed(to);
  }
}
