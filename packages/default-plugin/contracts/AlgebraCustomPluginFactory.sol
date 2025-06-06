// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-periphery/contracts/interfaces/IAlgebraCustomPoolEntryPoint.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import './interfaces/IAlgebraCustomPluginFactory.sol';

import './AlgebraDefaultPlugin.sol';

/// @title Algebra Integral 1.2.1 custom plugin factory
contract AlgebraCustomPluginFactory is IAlgebraCustomPluginFactory {
  /// @inheritdoc IAlgebraCustomPluginFactory
  bytes32 public constant override ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR = keccak256('ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR');

  /// @inheritdoc IAlgebraCustomPluginFactory
  address public immutable override algebraFactory;

  /// @inheritdoc IAlgebraCustomPluginFactory
  address public immutable entryPoint;

  /// @inheritdoc IAlgebraCustomPluginFactory
  uint16 public override baseFee = 3000;  

  /// @inheritdoc IAlgebraCustomPluginFactory
  mapping(address poolAddress => address pluginAddress) public override pluginByPool;

  modifier onlyAdministrator() {
    require(IAlgebraFactory(algebraFactory).hasRoleOrOwner(ALGEBRA_CUSTOM_PLUGIN_ADMINISTRATOR, msg.sender), 'Only administrator');
    _;
  }

  constructor(address _algebraFactory, address _entryPoint) {
    entryPoint = _entryPoint;
    algebraFactory = _algebraFactory;
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
    address plugin = address(new AlgebraDefaultPlugin(pool, algebraFactory, address(this), baseFee));
    pluginByPool[pool] = plugin;
    return address(plugin);
  }
  
  /// @inheritdoc IAlgebraCustomPluginFactory
  function createCustomPool(address creator, address tokenA, address tokenB, bytes calldata data) external returns (address customPool) {
    return IAlgebraCustomPoolEntryPoint(entryPoint).createCustomPool(address(this), creator, tokenA, tokenB, data);
  }

  /// @inheritdoc IAlgebraCustomPluginFactory
  function setSlidingBaseFee(uint16 _baseFee) external override onlyAdministrator {
    baseFee = _baseFee;
    emit SlidingBaseFee(baseFee);
  }
}