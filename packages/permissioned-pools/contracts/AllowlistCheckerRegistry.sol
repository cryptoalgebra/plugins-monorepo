// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import { IERC165 } from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IAllowlistCheckerRegistry.sol';
import './interfaces/IAllowlistChecker.sol';

/// @title Allowlist Checker Registry
/// @notice Governance-controlled per-token IAllowlistChecker registry, plus the shared
/// trusted-router (router/relayer) registry used across all permissioned pools.
/// @dev Access control via AlgebraFactory roles:
///   - PERMISSIONED_POOL_MANAGER: set/clear checkers, manage allowedRouters
contract AllowlistCheckerRegistry is IAllowlistCheckerRegistry {
  error CheckerDoesNotSupportInterface();

  address public immutable override algebraFactory;

  bytes32 public constant PERMISSIONED_POOL_MANAGER = keccak256('PERMISSIONED_POOL_MANAGER');

  /// @notice token => governance-approved checker
  mapping(address => address) public override getChecker;

  /// @notice router/relayer => trusted
  mapping(address => bool) public override allowedRouters;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IAllowlistCheckerRegistry
  function setChecker(address token, address checker) external override {
    _checkManager();
    if (checker != address(0) && !IERC165(checker).supportsInterface(type(IAllowlistChecker).interfaceId)) {
      revert CheckerDoesNotSupportInterface();
    }

    getChecker[token] = checker;
    emit CheckerUpdated(token, checker);
  }

  /// @inheritdoc IAllowlistCheckerRegistry
  function setRouterAllowed(address router, bool allowed) external override {
    _checkManager();
    allowedRouters[router] = allowed;
    emit RouterAllowedUpdated(router, allowed);
  }

  function _checkManager() internal view {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(PERMISSIONED_POOL_MANAGER, msg.sender), 'Only Permissioned Pool manager');
  }
}
