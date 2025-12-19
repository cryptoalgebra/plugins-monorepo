// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import '../interfaces/ILimitOrderPluginFactory.sol';
import './UpgradeableLimitOrderPluginTest.sol';
import '../LimitOrderPluginImplementation.sol';

/// @title Upgradeable LimitOrder Plugin Factory (test)
/// @notice Deploys BeaconProxy instances of UpgradeableLimitOrderPluginTest for Algebra pools
contract UpgradeableLimitOrderTestPluginFactory is IBasePluginFactory, ILimitOrderPluginFactory {
  address public limitOrderManager;

  address public immutable override algebraFactory;

  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  /// @notice Shared implementation for LimitOrderConnector delegatecalls
  address public immutable limitOrderImplementation;

  /// @notice Shared plugin implementation behind beacon
  address public immutable pluginImplementation;

  /// @notice Beacon storing the current plugin implementation
  UpgradeableBeacon public immutable beacon;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;

    limitOrderImplementation = address(new LimitOrderPluginImplementation());
    pluginImplementation = address(new UpgradeableLimitOrderPluginTest(_algebraFactory, address(this), limitOrderImplementation));
    beacon = new UpgradeableBeacon(pluginImplementation);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(
    address pool,
    address,
    address,
    address,
    address,
    bytes calldata
  ) external override returns (address) {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory, 'Only AlgebraFactory');
  }

  function _createPlugin(address pool) internal returns (address plugin) {
    require(pluginByPool[pool] == address(0), 'Already created');

    bytes memory initData = abi.encodeCall(UpgradeableLimitOrderPluginTest.initialize, (pool, limitOrderManager));
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

  /// @inheritdoc ILimitOrderPluginFactory
  function setLimitOrderManager(address newLimitOrderManager) external override {
    require(limitOrderManager != newLimitOrderManager);
    limitOrderManager = newLimitOrderManager;
    emit LimitOrderManager(newLimitOrderManager);
  }
}
