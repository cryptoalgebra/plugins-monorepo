// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import '../interfaces/ace/IAceIdentityRegistry.sol';
import '../interfaces/ace/IAceCredentialRegistry.sol';

/// @title Test Permissioned ERC20
/// @notice Demo token that reads Chainlink ACE credentials itself, the way a real RWA token would.
contract TestPermissionedERC20 is ERC20, Ownable {
  /// @notice The account does not hold the credential this token requires
  error TransferNotAllowed(address account);

  event RegistriesUpdated(address indexed identityRegistry, address indexed credentialRegistry);
  event RequiredCredentialTypeIdUpdated(bytes32 requiredCredentialTypeId);
  event ExemptUpdated(address indexed account, bool exempt);

  /// @notice The ACE IdentityRegistry resolving a wallet to its CCID; when unset the token is unrestricted
  address public identityRegistry;

  /// @notice The ACE CredentialRegistry queried for credential validity
  address public credentialRegistry;

  /// @notice The ACE credential type hash an account must hold, e.g. keccak256("common.kyc")
  /// @dev This is the platform's `credential_type_hash`, not the `credential_type_id` UUID
  bytes32 public requiredCredentialTypeId;

  /// @notice Accounts that bypass the check entirely, such as pools, routers and the treasury
  mapping(address account => bool exempt) public isExempt;

  constructor(
    string memory name_,
    string memory symbol_,
    address identityRegistry_,
    address credentialRegistry_,
    bytes32 requiredCredentialTypeId_
  ) ERC20(name_, symbol_) {
    identityRegistry = identityRegistry_;
    credentialRegistry = credentialRegistry_;
    requiredCredentialTypeId = requiredCredentialTypeId_;
    isExempt[msg.sender] = true;
    emit RegistriesUpdated(identityRegistry_, credentialRegistry_);
    emit RequiredCredentialTypeIdUpdated(requiredCredentialTypeId_);
    emit ExemptUpdated(msg.sender, true);
  }

  /// @notice Whether `account` may currently send or receive this token
  /// @dev Exposed for front ends so they can explain a rejection before submitting a transaction.
  /// Reverts rather than returning false if a registry is unreachable.
  function isAllowed(address account) public view returns (bool) {
    if (isExempt[account]) return true;
    if (identityRegistry == address(0)) return true;

    bytes32 ccid = IAceIdentityRegistry(identityRegistry).getIdentity(account);
    // A wallet with no identity on this chain can hold no credentials
    if (ccid == bytes32(0)) return false;

    return IAceCredentialRegistry(credentialRegistry).validate(ccid, requiredCredentialTypeId, '');
  }

  /// @notice Point the token at a different pair of ACE registries, or at address(0) to lift all restrictions
  function setRegistries(address newIdentityRegistry, address newCredentialRegistry) external onlyOwner {
    identityRegistry = newIdentityRegistry;
    credentialRegistry = newCredentialRegistry;
    emit RegistriesUpdated(newIdentityRegistry, newCredentialRegistry);
  }

  /// @notice Change which credential this token demands
  function setRequiredCredentialTypeId(bytes32 newRequiredCredentialTypeId) external onlyOwner {
    requiredCredentialTypeId = newRequiredCredentialTypeId;
    emit RequiredCredentialTypeIdUpdated(newRequiredCredentialTypeId);
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
    if (identityRegistry == address(0)) return;

    if (from != address(0) && !isAllowed(from)) revert TransferNotAllowed(from);
    if (to != address(0) && !isAllowed(to)) revert TransferNotAllowed(to);
  }
}
