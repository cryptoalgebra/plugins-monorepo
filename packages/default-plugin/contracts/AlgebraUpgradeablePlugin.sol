// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/plugin/IAlgebraPlugin.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseAbstractPlugin.sol';

import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyConnector.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPlugin.sol';

/// @title Algebra Integral 1.2.2 upgradeable plugin (simplified with FarmingProxy only)
/// @notice This is a simplified version for testing with only FarmingProxy plugin
contract AlgebraUpgradeablePlugin is 
  BaseAbstractPlugin, 
  FarmingProxyConnector
{
  using Plugins for uint8;

  constructor(
    address _pool,
    address _factory,
    address _pluginFactory,
    address _farmingProxyImpl
  ) 
    BaseAbstractPlugin(_pool, _factory, _pluginFactory)
    FarmingProxyConnector(_farmingProxyImpl)
  {
    // Initialize FarmingProxy plugin and get its config
    uint8 farmingProxyConfig = _initializeFarmingProxy();
    defaultPluginConfig = defaultPluginConfig | farmingProxyConfig;
    activeModules.push("Farming Proxy Plugin");
  }

  // ###### Required by FarmingProxyConnector ######

  /// @dev Provide pluginFactory address for FarmingProxyConnector
  function _getPluginFactory() internal view override returns (address) {
    return pluginFactory;
  }

  /// @dev Provide pool address for FarmingProxyConnector
  function _getPool() internal view override returns (address) {
    return pool;
  }

  // ###### HOOKS ######

  function beforeInitialize(address, uint160) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(address, uint160, int24) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    return IAlgebraPlugin.afterInitialize.selector;
  }

  /// @dev unused
  function beforeModifyPosition(address, address, int24, int24, int128, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return (IAlgebraPlugin.beforeModifyPosition.selector, 0);
  }

  /// @dev unused
  function afterModifyPosition(address, address, int24, int24, int128, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterModifyPosition.selector;
  }

  function beforeSwap(address, address, bool, int256, uint160, bool, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4, uint24, uint24) {
    return (IAlgebraPlugin.beforeSwap.selector, 0, 0);
  }

  function afterSwap(address, address, bool zeroToOne, int256, uint160, int256, int256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    // Get current tick
    (, int24 tick, , ) = _getPoolState();
    
    // Update FarmingProxy virtual pool
    _updateVirtualPoolTick(zeroToOne, tick);
    
    return IAlgebraPlugin.afterSwap.selector;
  }

  /// @dev unused
  function beforeFlash(address, address, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.beforeFlash.selector;
  }

  /// @dev unused
  function afterFlash(address, address, uint256, uint256, uint256, uint256, bytes calldata) external override(AbstractPlugin, IAlgebraPlugin) onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig); // should not be called, reset config
    return IAlgebraPlugin.afterFlash.selector;
  }

}
