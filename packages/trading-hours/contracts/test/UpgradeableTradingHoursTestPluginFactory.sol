// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/abstract-plugin/contracts/interfaces/IBasePluginFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import '@cryptoalgebra/abstract-plugin/contracts/AlgebraPluginProxy.sol';

import { UpgradeableBeacon } from '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';

import './UpgradeableTradingHoursPluginTest.sol';
import '../TradingHoursPluginImplementation.sol';

/// @title Upgradeable Trading Hours Plugin Factory (test)
/// @notice Deploys BeaconProxy instances of UpgradeableTradingHoursPluginTest for Algebra pools
/// @dev Pools start disabled (00:00-24:00 UTC default hours, zero day-of-week offset, Sat/Sun default mask,
/// module inactive) - the pool admin configures actual hours/weekdays per pool and calls setEnabled(true)
/// when ready, since each pool can track a different market's schedule
contract UpgradeableTradingHoursTestPluginFactory is IBasePluginFactory {
  address public immutable override algebraFactory;

  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  /// @notice Shared implementation for TradingHoursConnector delegatecalls
  address public immutable tradingHoursImplementation;

  /// @notice Shared plugin implementation behind beacon
  address public immutable pluginImplementation;

  /// @notice Beacon storing the current plugin implementation
  UpgradeableBeacon public immutable beacon;

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;

    tradingHoursImplementation = address(new TradingHoursPluginImplementation());
    pluginImplementation = address(new UpgradeableTradingHoursPluginTest(_algebraFactory, address(this), tradingHoursImplementation));
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

    // default blocked-weekdays mask is Sat/Sun (bit 0 = Sunday, bit 6 = Saturday), only takes effect once
    // the pool admin calls setEnabled(true)
    bytes memory initData = abi.encodeCall(
      UpgradeableTradingHoursPluginTest.initialize,
      (pool, 0, uint32(1 days), int32(0), uint8(0x41), false)
    );
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
}
