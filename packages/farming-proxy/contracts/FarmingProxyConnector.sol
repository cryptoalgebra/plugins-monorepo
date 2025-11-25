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

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable farmingProxyImplementation;

  struct FarmingProxyLayout {
    address incentive;
    address lastIncentiveOwner;
  }

  constructor(address _farmingProxyImplementation) {
    farmingProxyImplementation = _farmingProxyImplementation;
  }

  /// @dev Propagate revert reason from delegatecall
  function _propagateRevert(bytes memory returnData) internal pure {
    if (returnData.length > 0) {
      assembly {
        revert(add(32, returnData), mload(returnData))
      }
    }
    revert('FarmingProxy: delegatecall failed');
  }

  /// @dev Fetch pointer of FarmingProxy plugin's storage
  function _getFarmingProxyLayout() internal pure returns (FarmingProxyLayout storage layout) {
    bytes32 position = FARMING_PROXY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Get the incentive address
  function _getIncentive() internal view returns (address) {
    return _getFarmingProxyLayout().incentive;
  }

  /// @notice Initialize FarmingProxy plugin via delegatecall
  function _initializeFarmingProxy() internal returns (uint8) {
    bytes memory data = abi.encodeWithSignature('initializeFarmingProxy()');
    
    (bool success, bytes memory returnData) = farmingProxyImplementation.delegatecall(data);
    if (!success) _propagateRevert(returnData);
    
    return FARMING_PROXY_PLUGIN_CONFIG;
  }

  /// @notice Set incentive via delegatecall
  /// @dev All logic is in implementation, including access checks and plugin state management
  function _setIncentive(address newIncentive, address pluginFactory, address pool) internal {
    bytes memory data = abi.encodeWithSignature(
      'setIncentive(address,address,address)',
      newIncentive,
      pluginFactory,
      pool
    );
    
    (bool success, bytes memory returnData) = farmingProxyImplementation.delegatecall(data);
    if (!success) _propagateRevert(returnData);
  }

  /// @notice Check if incentive is connected via delegatecall
  /// @dev All logic is in implementation
  function _isIncentiveConnected(address targetIncentive, address pool) internal view returns (bool) {
    bytes memory data = abi.encodeWithSignature(
      'isIncentiveConnected(address,address)',
      targetIncentive,
      pool
    );
    
    (bool success, bytes memory returnData) = farmingProxyImplementation.staticcall(data);
    if (!success) _propagateRevert(returnData);
    
    return abi.decode(returnData, (bool));
  }

  /// @notice Update virtual pool tick via delegatecall
  function _updateVirtualPoolTick(bool zeroToOne, int24 tick) internal {
    bytes memory data = abi.encodeWithSignature('updateVirtualPoolTick(bool,int24)', zeroToOne, tick);
    
    (bool success, bytes memory returnData) = farmingProxyImplementation.delegatecall(data);
    if (!success) _propagateRevert(returnData);
  }

  // ###### Public Interface (IFarmingPlugin) ######

  /// @inheritdoc IFarmingPlugin
  function incentive() external view override returns (address) {
    return _getIncentive();
  }

  /// @inheritdoc IFarmingPlugin
  function setIncentive(address newIncentive) external override {
    address pluginFactory = _getPluginFactory();
    address pool = _getPool();
    _setIncentive(newIncentive, pluginFactory, pool);
    emit Incentive(newIncentive);
  }

  /// @inheritdoc IFarmingPlugin
  function isIncentiveConnected(address targetIncentive) external view override returns (bool) {
    address pool = _getPool();
    return _isIncentiveConnected(targetIncentive, pool);
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
