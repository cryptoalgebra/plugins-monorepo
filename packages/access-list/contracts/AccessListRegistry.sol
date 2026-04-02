// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IAccessListRegistry.sol';

/// @title Access List Registry
/// @notice Manages user whitelist for access-list-gated pools.
/// @dev Access control via AlgebraFactory roles:
///   - ACCESS_LIST_MANAGER: manage whitelist, pause, unpause
/// Non-whitelisted users are fully blocked from swap, add liquidity, flash and pool init.
/// Remove liquidity is always allowed.
contract AccessListRegistry is IAccessListRegistry {
  address public immutable algebraFactory;

  bytes32 public constant ACCESS_LIST_MANAGER = keccak256('ACCESS_LIST_MANAGER');

  /// @inheritdoc IAccessListRegistry
  bool public override isPaused;

  /// @notice Access list whitelist: user address => whitelisted
  mapping(address => bool) public override isWhitelisted;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IAccessListRegistry
  function setWhitelisted(address user, bool status) external override {
    _checkManager();
    isWhitelisted[user] = status;
    emit UserWhitelistUpdated(user, status);
  }

  /// @inheritdoc IAccessListRegistry
  function setWhitelistedBatch(address[] calldata users, bool[] calldata statuses) external override {
    _checkManager();
    require(users.length == statuses.length, 'Length mismatch');
    for (uint256 i = 0; i < users.length; i++) {
      isWhitelisted[users[i]] = statuses[i];
      emit UserWhitelistUpdated(users[i], statuses[i]);
    }
  }

  /// @inheritdoc IAccessListRegistry
  function pause() external override {
    _checkManager();
    isPaused = true;
    emit AccessListPaused();
  }

  /// @inheritdoc IAccessListRegistry
  function unpause() external override {
    _checkManager();
    isPaused = false;
    emit AccessListUnpaused();
  }

  function _checkManager() internal view {
    require(
      IAlgebraFactory(algebraFactory).hasRoleOrOwner(ACCESS_LIST_MANAGER, msg.sender),
      'Only Access List manager'
    );
  }

}
