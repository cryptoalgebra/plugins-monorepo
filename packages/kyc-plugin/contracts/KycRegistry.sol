// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IKycRegistry.sol';

/// @title KYC Registry
/// @notice Manages KYC user whitelist for KYC-gated pools.
/// @dev Access control via AlgebraFactory roles:
///   - KYC_MANAGER: manage whitelist, unpause
///   - KYC_PAUSER: can only pause (emergency)
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
contract KycRegistry is IKycRegistry {
  address public immutable algebraFactory;

  bytes32 public constant KYC_MANAGER = keccak256('KYC_MANAGER');
  bytes32 public constant KYC_PAUSER = keccak256('KYC_PAUSER');

  /// @inheritdoc IKycRegistry
  bool public override isPaused;

  /// @notice KYC whitelist: user address => whitelisted
  mapping(address => bool) public override isWhitelisted;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IKycRegistry
  function setWhitelisted(address user, bool status) external override {
    _checkManager();
    isWhitelisted[user] = status;
    emit UserWhitelistUpdated(user, status);
  }

  /// @inheritdoc IKycRegistry
  function setWhitelistedBatch(address[] calldata users, bool[] calldata statuses) external override {
    _checkManager();
    require(users.length == statuses.length, 'Length mismatch');
    for (uint256 i = 0; i < users.length; i++) {
      isWhitelisted[users[i]] = statuses[i];
      emit UserWhitelistUpdated(users[i], statuses[i]);
    }
  }

  /// @inheritdoc IKycRegistry
  function pause() external override {
    _checkPauser();
    isPaused = true;
    emit KycPaused();
  }

  /// @inheritdoc IKycRegistry
  function unpause() external override {
    _checkManager();
    isPaused = false;
    emit KycUnpaused();
  }

  function _checkManager() internal view {
    require(
      IAlgebraFactory(algebraFactory).hasRoleOrOwner(KYC_MANAGER, msg.sender),
      'Only KYC manager'
    );
  }

  function _checkPauser() internal view {
    require(
      IAlgebraFactory(algebraFactory).hasRoleOrOwner(KYC_PAUSER, msg.sender) ||
        IAlgebraFactory(algebraFactory).hasRoleOrOwner(KYC_MANAGER, msg.sender),
      'Only KYC pauser'
    );
  }
}
