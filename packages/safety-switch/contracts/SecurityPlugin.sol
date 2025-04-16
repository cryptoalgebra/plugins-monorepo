// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/AlgebraAbstractPlugin.sol';

import './interfaces/ISecurityPlugin.sol';
import './interfaces/ISecurityRegistry.sol';

/// @title Algebra Integral 1.2 security plugin
abstract contract SecurityPlugin is AlgebraAbstractPlugin, ISecurityPlugin {
  using Plugins for uint8;

  uint8 private constant defaultPluginConfig = uint8(Plugins.BEFORE_SWAP_FLAG | Plugins.BEFORE_FLASH_FLAG | Plugins.BEFORE_POSITION_MODIFY_FLAG);

  address internal securityRegistry;

  constructor(address _securityRegistry) {
    securityRegistry = _securityRegistry;
  }

  function _checkStatus() internal {
    ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(msg.sender);
    if (status != ISecurityRegistry.Status.ENABLED) {
      if (status == ISecurityRegistry.Status.DISABLED) {
        revert PoolDisabled();
      } else {
        revert BurnOnly();
      }
    }
  }

  function _checkStatusOnBurn() internal {
    ISecurityRegistry.Status status = ISecurityRegistry(securityRegistry).getPoolStatus(msg.sender);
    if (status == ISecurityRegistry.Status.DISABLED) {
      revert PoolDisabled();
    }
  }

  function setSecurityRegistry(address _securityRegistry) external override {
    _authorize();
    securityRegistry = _securityRegistry;
    emit SecurityRegistry(_securityRegistry);
  }

  function getSecurityRegistry() external view override returns (address) {
    return securityRegistry;
  }
}
