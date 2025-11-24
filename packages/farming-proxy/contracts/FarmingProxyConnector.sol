// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import './interfaces/IFarmingPlugin.sol';

/// @title FarmingProxy Connector
/// @notice This contract provides delegatecall interface to FarmingProxy plugin implementation
/// @dev Inherits from IFarmingPlugin and provides all public methods as thin wrappers
abstract contract FarmingProxyConnector is IFarmingPlugin {
  using Plugins for uint8;

  /// @dev Storage namespace for FarmingProxy plugin using ERC-7201
  bytes32 internal constant FARMING_PROXY_NAMESPACE = keccak256('algebra.storage.farmingproxy');

  uint8 internal constant FARMING_PROXY_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  struct FarmingProxyLayout {
    address implementation;
    address incentive;
    address lastIncentiveOwner;
  }

  /// @dev Fetch pointer of FarmingProxy plugin's storage
  function _getFarmingProxyLayout() internal pure returns (FarmingProxyLayout storage layout) {
    bytes32 position = FARMING_PROXY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Get FarmingProxy implementation address
  function _getFarmingProxyImplementation() internal view returns (address) {
    return _getFarmingProxyLayout().implementation;
  }

  /// @notice Set FarmingProxy implementation address
  function _setFarmingProxyImplementation(address newImplementation) internal {
    _getFarmingProxyLayout().implementation = newImplementation;
  }

  /// @notice Get the incentive address
  function _getIncentive() internal view returns (address) {
    return _getFarmingProxyLayout().incentive;
  }

  /// @notice Initialize FarmingProxy plugin via delegatecall
  function _initializeFarmingProxy() internal returns (uint8) {
    address impl = _getFarmingProxyImplementation();
    require(impl != address(0), 'FarmingProxy: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('initializeFarmingProxy()');
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'FarmingProxy: initialization failed');
    
    return FARMING_PROXY_PLUGIN_CONFIG;
  }

  /// @notice Set incentive via delegatecall
  /// @dev All logic is in implementation, including access checks and plugin state management
  function _setIncentive(address newIncentive, address pluginFactory) internal {
    address impl = _getFarmingProxyImplementation();
    require(impl != address(0), 'FarmingProxy: implementation not set');
    
    bytes memory data = abi.encodeWithSignature(
      'setIncentive(address,address)',
      newIncentive,
      pluginFactory
    );
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'FarmingProxy: setIncentive failed');
  }

  /// @notice Check if incentive is connected via delegatecall
  /// @dev All logic is in implementation
  function _isIncentiveConnected(address targetIncentive) internal returns (bool) {
    address impl = _getFarmingProxyImplementation();
    require(impl != address(0), 'FarmingProxy: implementation not set');
    
    bytes memory data = abi.encodeWithSignature(
      'isIncentiveConnected(address)',
      targetIncentive
    );
    
    (bool success, bytes memory returnData) = impl.delegatecall(data);
    require(success, 'FarmingProxy: isIncentiveConnected failed');
    
    return abi.decode(returnData, (bool));
  }

  /// @notice Update virtual pool tick via delegatecall
  function _updateVirtualPoolTick(bool zeroToOne, int24 tick) internal {
    address impl = _getFarmingProxyImplementation();
    require(impl != address(0), 'FarmingProxy: implementation not set');
    
    bytes memory data = abi.encodeWithSignature('updateVirtualPoolTick(bool,int24)', zeroToOne, tick);
    
    (bool success, ) = impl.delegatecall(data);
    require(success, 'FarmingProxy: updateVirtualPoolTick failed');
  }

  // ###### Public Interface (IFarmingPlugin) ######

  /// @inheritdoc IFarmingPlugin
  function incentive() external view override returns (address) {
    return _getIncentive();
  }

  /// @inheritdoc IFarmingPlugin
  function setIncentive(address newIncentive) external override {
    // Get pluginFactory from context - must be provided by inheriting contract
    address pluginFactory = _getPluginFactory();
    _setIncentive(newIncentive, pluginFactory);
    emit Incentive(newIncentive);
  }

  /// @inheritdoc IFarmingPlugin
  function isIncentiveConnected(address targetIncentive) external override returns (bool) {
    return _isIncentiveConnected(targetIncentive);
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

  /// @dev Must be implemented by inheriting contract to get pool state
  function _getPoolState() internal view virtual returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig);

  /// @dev Must be implemented by inheriting contract to get current plugin in pool
  function _getPluginInPool() internal view virtual returns (address);

  /// @dev Must be implemented by inheriting contract to enable plugin flags
  function _enablePluginFlags(uint8 config) internal virtual;
}
