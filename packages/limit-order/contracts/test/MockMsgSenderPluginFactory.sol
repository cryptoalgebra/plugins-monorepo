// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPluginFactory.sol';

import './MockMsgSenderPlugin.sol';

/// @title Deploys a MockMsgSenderPlugin for every pool
contract MockMsgSenderPluginFactory is IAlgebraPluginFactory {
  address public immutable algebraFactory;

  mapping(address poolAddress => address pluginAddress) public pluginByPool;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
    require(pluginByPool[pool] == address(0), 'Already created');
    pluginByPool[pool] = address(new MockMsgSenderPlugin());
    return pluginByPool[pool];
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
  }
}
