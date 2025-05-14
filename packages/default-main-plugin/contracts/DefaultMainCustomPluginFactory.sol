// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IDefaultMainCustomPluginFactory.sol';

import './DefaultMainPlugin.sol';

/// @title Algebra Integral 1.2.1 main custom plugin deployer
contract DefaultMainCustomPluginFactory is IDefaultMainCustomPluginFactory {
  /// @inheritdoc IDefaultMainCustomPluginFactory
  bytes32 public constant override ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR = keccak256('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

  /// @inheritdoc IDefaultMainCustomPluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IDefaultMainCustomPluginFactory
  address public immutable entryPoint;

  address public router;

  /// @inheritdoc IDefaultMainCustomPluginFactory
  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory, address _entryPoint, address _router) {
    entryPoint = _entryPoint;
    algebraFactory = _algebraFactory;
    router = _router;
  }

  /// @inheritdoc IAlgebraPluginFactory
  function beforeCreatePoolHook(address pool, address, address, address, address, bytes calldata) external override returns (address) {
    require(msg.sender == entryPoint);
    return _createPlugin(pool);
  }

  /// @inheritdoc IAlgebraPluginFactory
  function afterCreatePoolHook(address, address, address) external view override {
    require(msg.sender == entryPoint);
  }

  function _createPlugin(address pool) internal returns (address) {
    require(pluginByPool[pool] == address(0), 'Already created');
    address plugin = address(new DefaultMainPlugin(pool, algebraFactory, address(this), router));
    pluginByPool[pool] = plugin;
    return address(plugin);
  }
  
  /// @inheritdoc IDefaultMainCustomPluginFactory
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external returns (address customPool) {
    return IAlgebraCustomPoolEntryPoint(entryPoint).createCustomPool(address(this), creator, tokenA, tokenB, data);
  }

  function setRouter(address _router) external onlyAdministrator {
    router = _router;
  }
}