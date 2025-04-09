// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import './interfaces/IAbstractPluginFactory.sol';

abstract contract AbstractPluginFactory is IAbstractPluginFactory {
  address public immutable override entryPoint;

  constructor(address _entryPoint) {
    entryPoint = _entryPoint;
  }

  /// @inheritdoc IAbstractPluginFactory
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external virtual returns (address customPool) {
    return IAlgebraCustomPoolEntryPoint(entryPoint).createCustomPool(address(this), creator, tokenA, tokenB, data);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external virtual override returns (address) {
    require(msg.sender == entryPoint);
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view virtual override {
    require(msg.sender == entryPoint);
  }

  function _createPlugin(address pool) internal virtual returns (address);
}
