// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';

import './interfaces/IDefaultMainPluginFactory.sol';
import './DefaultMainPlugin.sol';

/// @title Algebra Integral 1.2.1 default plugin factory
/// @notice This contract creates Algebra adaptive fee plugins for Algebra liquidity pools
/// @dev This plugin factory can only be used for Algebra default pools
contract DefaultMainPluginFactory is IDefaultMainPluginFactory {
  /// @inheritdoc IDefaultMainPluginFactory
  bytes32 public constant override ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR = keccak256('ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR');

  /// @inheritdoc IBasePluginFactory
  address public immutable override algebraFactory;

  address public router;

  /// @inheritdoc IBasePluginFactory
  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_FACTORY_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == algebraFactory);
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == algebraFactory);
  }

  /// @inheritdoc IBasePluginFactory
  function createPluginForExistingPool(address token0, address token1) external override returns (address) {
    IAlgebraFactory factory = IAlgebraFactory(algebraFactory);
    require(factory.hasRoleOrOwner(factory.POOLS_ADMINISTRATOR_ROLE(), msg.sender));

    address pool = factory.poolByPair(token0, token1);
    require(pool != address(0), 'Pool not exist');

    return _createPlugin(pool);
  }

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    IVolatilityOracle volatilityOracle = new DefaultMainPlugin(pool, algebraFactory, address(this));
    pluginByPool[pool] = address(volatilityOracle);
    return address(volatilityOracle);
  }

  function setRouter(address _router) external onlyAdministrator {
    router = _router;
  }
}
