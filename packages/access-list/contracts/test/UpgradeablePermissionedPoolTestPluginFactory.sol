// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import './UpgradeablePermissionedPoolPluginTest.sol';
import '../PermissionedPoolPluginImplementation.sol';

/// @title Upgradeable Permissioned Pool Plugin Factory (test)
/// @notice Deploys BeaconProxy instances of UpgradeablePermissionedPoolPluginTest for Algebra pools
contract UpgradeablePermissionedPoolTestPluginFactory is IBasePluginFactory {
  address public permissionsAdapterFactory;

  address public immutable override algebraFactory;

  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  /// @notice Shared implementation for PermissionedPoolConnector delegatecalls
  address public immutable permissionedPoolImplementation;

  /// @notice Shared plugin implementation behind beacon
  address public immutable pluginImplementation;

  /// @notice Beacon storing the current plugin implementation
  UpgradeableBeacon public immutable beacon;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;

    permissionedPoolImplementation = address(new PermissionedPoolPluginImplementation());
    pluginImplementation = address(
      new UpgradeablePermissionedPoolPluginTest(_algebraFactory, address(this), permissionedPoolImplementation)
    );
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

    bytes memory initData = abi.encodeCall(UpgradeablePermissionedPoolPluginTest.initialize, (pool, permissionsAdapterFactory));
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

  function setPermissionsAdapterFactory(address newPermissionsAdapterFactory) external {
    require(permissionsAdapterFactory != newPermissionsAdapterFactory);
    permissionsAdapterFactory = newPermissionsAdapterFactory;
  }
}
