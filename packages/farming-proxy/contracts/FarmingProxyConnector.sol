// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/IFarmingPlugin.sol';
import './interfaces/IFarmingProxyPluginImplementation.sol';
import './libraries/FarmingProxyStorage.sol';

/// @title FarmingProxy Connector
/// @notice This contract provides delegatecall interface to FarmingProxy plugin implementation
abstract contract FarmingProxyConnector is BaseConnector, IFarmingPlugin {
  using Plugins for uint8;

  string internal constant FARMING_PROXY_MODULE_NAME = 'Farming Proxy Plugin';
  uint8 internal constant FARMING_PROXY_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable farmingProxyImplementation;

  constructor(address _farmingProxyImplementation) {
    farmingProxyImplementation = _farmingProxyImplementation;
  }

  /// @notice Update virtual pool tick via delegatecall
  function _updateVirtualPoolTick(bool zeroToOne, int24 tick) internal {
    _delegateCall(farmingProxyImplementation, abi.encodeCall(IFarmingProxyPluginImplementation.updateVirtualPoolTick, (zeroToOne, tick)));
  }

  // ###### Public Interface (IFarmingPlugin) ######

  /// @inheritdoc IFarmingPlugin
  function incentive() external view override returns (address) {
    return FarmingProxyStorage.layout().incentive;
  }

  /// @inheritdoc IFarmingPlugin
  function setIncentive(address newIncentive) external override {
    _delegateCall(
      farmingProxyImplementation,
      abi.encodeCall(IFarmingProxyPluginImplementation.setIncentive, (newIncentive, _getPluginFactory(), _getPool()))
    );
    emit Incentive(newIncentive);
  }

  /// @inheritdoc IFarmingPlugin
  function isIncentiveConnected(address targetIncentive) external override returns (bool) {
    bytes memory returnData = _delegateCall(
      farmingProxyImplementation,
      abi.encodeCall(IFarmingProxyPluginImplementation.isIncentiveConnected, (targetIncentive, _getPool()))
    );
    return abi.decode(returnData, (bool));
  }

  /// @inheritdoc IFarmingPlugin
  function getPool() external view override returns (address) {
    return _getPool();
  }

  // ###### Internal helpers to be implemented by inheriting contract ######

  /// @dev Must be implemented by inheriting contract to provide pluginFactory address
  function _getPluginFactory() internal view virtual returns (address);

  /// @dev Must be implemented by inheriting contract to provide pool address
  function _getPool() internal view virtual returns (address);
}
