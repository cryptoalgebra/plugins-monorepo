// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IPermissionsAdapterFactory.sol';
import './interfaces/IPermissionsAdapter.sol';

/// @title Permissions Adapter Factory
/// @notice Registered-vs-verified registry of per-token PermissionsAdapters, plus the shared
/// trusted-router (router/relayer) registry used across all permissioned pools.
/// @dev Access control via AlgebraFactory roles:
///   - PERMISSIONED_POOL_MANAGER: verify/unverify adapters, manage allowedRouters
contract PermissionsAdapterFactory is IPermissionsAdapterFactory {
  address public immutable override algebraFactory;

  bytes32 public constant PERMISSIONED_POOL_MANAGER = keccak256('PERMISSIONED_POOL_MANAGER');

  /// @notice token => registered adapter
  mapping(address => address) public override getAdapter;

  /// @notice token => whether the registered adapter is governance-verified
  mapping(address => bool) public override isVerified;

  /// @notice router/relayer => trusted
  mapping(address => bool) public override allowedRouters;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IPermissionsAdapterFactory
  function registerAdapter(address token, address adapter) external override {
    require(msg.sender == IPermissionsAdapter(adapter).admin(), 'Only adapter admin');
    require(IPermissionsAdapter(adapter).token() == token, 'Token mismatch');

    getAdapter[token] = adapter;
    isVerified[token] = false;

    emit AdapterRegistered(token, adapter, msg.sender);
  }

  /// @inheritdoc IPermissionsAdapterFactory
  function verifyAdapter(address token, bool verified) external override {
    _checkManager();
    require(getAdapter[token] != address(0), 'No adapter registered');

    isVerified[token] = verified;
    emit AdapterVerified(token, verified);
  }

  /// @inheritdoc IPermissionsAdapterFactory
  function setRouterAllowed(address router, bool allowed) external override {
    _checkManager();
    allowedRouters[router] = allowed;
    emit RouterAllowedUpdated(router, allowed);
  }

  function _checkManager() internal view {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(PERMISSIONED_POOL_MANAGER, msg.sender), 'Only Permissioned Pool manager');
  }
}
