// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './AbstractPlugin.sol';

/// @title Algebra's internal Integral 1.2.1 plugin base
/// @notice This contract inherits AbstractPlugin
abstract contract BaseAbstractPlugin is AbstractPlugin {
  address internal immutable factory;

  constructor(address _pool, address _factory, address _pluginFactory) AbstractPlugin(_pool, _pluginFactory) {
    factory = _factory;
  }

  function _authorize() internal view virtual override {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender));
  }
}
