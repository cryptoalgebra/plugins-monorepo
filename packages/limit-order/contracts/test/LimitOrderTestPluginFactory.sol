// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import "@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol";

import '../interfaces/ILimitOrderPluginFactory.sol';
import '../interfaces/ILimitOrderPlugin.sol';
import './LimitOrderTestPlugin.sol';
import 'hardhat/console.sol';

/// @title Algebra Integral limit plugin factory
contract LimitOrderTestPluginFactory is IBasePluginFactory, ILimitOrderPluginFactory {

  address public limitOrderModule;

  address public algebraFactory;

  mapping(address poolAddress => address pluginAddress) public pluginByPool;

  constructor(address _algebraFactory) {
      algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external  returns (address) {
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
        console.log("factory");
  }

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    ILimitOrderPlugin plugin = new LimitOrderTestPlugin(pool, algebraFactory, address(this), limitOrderModule);
    pluginByPool[pool] = address(plugin);
    console.log("factory");
    return address(plugin);
  }

  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool);
  }

  function setLimitOrderModule(address newLimitOrderModule) external override  {
    require(limitOrderModule != newLimitOrderModule);
    limitOrderModule = newLimitOrderModule;
    emit LimitOrderModule(newLimitOrderModule);
  }
}
