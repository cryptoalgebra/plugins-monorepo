// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import '../interfaces/IAccessListPluginFactory.sol';
import './UpgradeableAccessListPluginTest.sol';
import '../AccessListPluginImplementation.sol';

/// @title Upgradeable Access List Plugin Factory (test)
/// @notice Deploys BeaconProxy instances of UpgradeableAccessListPluginTest for Algebra pools
contract UpgradeableAccessListTestPluginFactory is IBasePluginFactory, IAccessListPluginFactory {
  address public override accessListRegistry;

  address public immutable override algebraFactory;

  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  /// @notice Shared implementation for AccessListConnector delegatecalls
  address public immutable accessListImplementation;

  /// @notice Shared plugin implementation behind beacon
  address public immutable pluginImplementation;

  /// @notice Beacon storing the current plugin implementation
  UpgradeableBeacon public immutable beacon;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;

    accessListImplementation = address(new AccessListPluginImplementation());
    pluginImplementation = address(new UpgradeableAccessListPluginTest(_algebraFactory, address(this), accessListImplementation));
    beacon = new UpgradeableBeacon(pluginImplementation);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    require(pluginByPool[pool] == address(0), 'Already created');

    bytes memory initData = abi.encodeCall(UpgradeableAccessListPluginTest.initialize, (pool, accessListRegistry));
    plugin = address(new AlgebraPluginProxy(address(beacon), pool, initData));

    pluginByPool[pool] = plugin;
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool);
  }

  /// @inheritdoc IAccessListPluginFactory
  function setAccessListRegistry(address newAccessListRegistry) external override {
    require(accessListRegistry != newAccessListRegistry);
    accessListRegistry = newAccessListRegistry;
    emit AccessListRegistry(newAccessListRegistry);
  }
}
