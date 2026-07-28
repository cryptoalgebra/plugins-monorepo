// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './interfaces/IPermissionsAdapter.sol';

/// @title Permissions Adapter
/// @notice Per-token allowlist + emergency kill switch, deployed and managed by a token issuer.
/// @dev Deployed standalone, then registered against `token` via PermissionsAdapterFactory.registerAdapter.
/// The factory separately tracks whether a registration is "verified" - registering an adapter here
/// grants it no trust by itself.
contract PermissionsAdapter is IPermissionsAdapter {
  error OnlyAdmin();
  error LengthMismatch();

  /// @inheritdoc IPermissionsAdapter
  address public immutable override token;

  /// @inheritdoc IPermissionsAdapter
  address public immutable override admin;

  /// @inheritdoc IPermissionsAdapter
  mapping(address => bool) public override isAllowed;

  /// @inheritdoc IPermissionsAdapter
  bool public override swappingEnabled = true;

  modifier onlyAdmin() {
    if (msg.sender != admin) revert OnlyAdmin();
    _;
  }

  constructor(address _token, address _admin) {
    token = _token;
    admin = _admin;
  }

  /// @inheritdoc IPermissionsAdapter
  function setAllowed(address account, bool allowed) external override onlyAdmin {
    isAllowed[account] = allowed;
    emit AccountAllowedUpdated(account, allowed);
  }

  /// @inheritdoc IPermissionsAdapter
  function setAllowedBatch(address[] calldata accounts, bool[] calldata allowed) external override onlyAdmin {
    if (accounts.length != allowed.length) revert LengthMismatch();
    for (uint256 i = 0; i < accounts.length; i++) {
      isAllowed[accounts[i]] = allowed[i];
      emit AccountAllowedUpdated(accounts[i], allowed[i]);
    }
  }

  /// @inheritdoc IPermissionsAdapter
  function setSwappingEnabled(bool enabled) external override onlyAdmin {
    swappingEnabled = enabled;
    emit SwappingEnabledUpdated(enabled);
  }
}
