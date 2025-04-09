// SPDX-License-Identifier: GPL-2.0-or-later
// TODO: change to 0.8^
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/base/common/Timestamp.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/libraries/SafeTransfer.sol';

import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraFactory.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';

import './interfaces/IAbstractPlugin.sol';

/// @title Algebra Integral 1.2.1 plugin base
/// @notice This contract simplifies development process of plugins by providing base functionality
abstract contract AbstractPlugin is IAbstractPlugin, Timestamp {
  using Plugins for uint8;

  /// @dev The role can be granted in AlgebraFactory
  bytes32 public constant ALGEBRA_BASE_PLUGIN_MANAGER = keccak256('ALGEBRA_BASE_PLUGIN_MANAGER');

  uint8 private constant defaultPluginConfig = 0;

  address public immutable pool;
  address internal immutable pluginFactory;

  modifier onlyPool() {
    _checkIfFromPool();
    _;
  }

  constructor(address _pool, address _pluginFactory) {
    (pool, pluginFactory) = (_pool, _pluginFactory);
  }

  function _checkIfFromPool() internal view {
    require(msg.sender == pool, 'Only pool can call this');
  }

  function _authorize() internal view virtual;

  function _getPoolState() internal view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig) {
    (price, tick, fee, pluginConfig, , ) = IAlgebraPoolState(pool).globalState();
  }

  function _getPluginInPool() internal view returns (address plugin) {
    return IAlgebraPool(pool).plugin();
  }

  /// @inheritdoc IAbstractPlugin
  function collectPluginFee(address token, uint256 amount, address recipient) external override {
    _authorize();
    SafeTransfer.safeTransfer(token, recipient, amount);
  }

  /// @inheritdoc IAlgebraPlugin
  function handlePluginFee(uint256, uint256) external view override onlyPool returns (bytes4) {
    return IAlgebraPlugin.handlePluginFee.selector;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external virtual override onlyPool returns (bytes4, uint24) {
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  function afterModifyPosition(
    address,
    address,
    int24,
    int24,
    int128,
    uint256,
    uint256,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(
    address,
    address,
    bool,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external virtual override onlyPool returns (bytes4, uint24, uint24) {
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function afterSwap(address, address, bool, int256, uint160, int256, int256, bytes calldata) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterSwap.selector;
  }

  function beforeFlash(address, address, uint256, uint256, bytes calldata) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.beforeFlash.selector;
  }

  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external virtual override onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterFlash.selector;
  }

  function _updatePluginConfigInPool(uint8 newPluginConfig) internal {
    (, , , uint8 currentPluginConfig) = _getPoolState();
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }

  function _disablePluginFlags(uint8 config) internal {
    (, , , uint8 currentPluginConfig) = _getPoolState();
    uint8 newPluginConfig = currentPluginConfig & ~config;
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }

  function _enablePluginFlags(uint8 config) internal {
    (, , , uint8 currentPluginConfig) = _getPoolState();
    uint8 newPluginConfig = currentPluginConfig | config;
    if (currentPluginConfig != newPluginConfig) {
      IAlgebraPool(pool).setPluginConfig(newPluginConfig);
    }
  }
}
