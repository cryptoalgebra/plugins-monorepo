// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderPluginImplementation.sol';

/// @title LimitOrder Connector
/// @notice This contract provides delegatecall functions to LimitOrder implementation
/// @dev Inherits from ILimitOrderPlugin and provides all public methods as thin wrappers
abstract contract LimitOrderConnector is ILimitOrderPlugin, BaseConnector {
  using Plugins for uint8;

  uint8 internal constant LIMIT_ORDER_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable limitOrderImplementation;

  constructor(address _limitOrderImplementation) {
    limitOrderImplementation = _limitOrderImplementation;
  }

  /// @notice Get the limitOrderManager address via delegatecall
  function _getLimitOrderManager() internal returns (address) {
    bytes memory returnData = _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.getLimitOrderManager, ())
    );
    return abi.decode(returnData, (address));
  }

  /// @notice Set the limitOrderManager address via delegatecall
  function _setLimitOrderManager(address manager) internal {
    _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.setLimitOrderManager, (manager))
    );
  }

  /// @notice Initialize LimitOrder plugin with manager address via delegatecall
  function _initializeLimitOrder(address _limitOrderManager) internal returns (uint8) {
    _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.initializeLimitOrder, (_limitOrderManager))
    );
    return LIMIT_ORDER_PLUGIN_CONFIG;
  }

  /// @notice Update limit order manager state after swap via delegatecall
  function _updateLimitOrderManagerState(address pool, bool zeroToOne, int24 tick) internal {
    _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.updateLimitOrderManagerState, (pool, zeroToOne, tick))
    );
  }

  // ###### Public Interface (ILimitOrderPlugin) ######

  /// @inheritdoc ILimitOrderPlugin
  function limitOrderManager() external override returns (address) {
    return _getLimitOrderManager();
  }

  /// @inheritdoc ILimitOrderPlugin
  function setLimitOrderManager(address newModule) external override {
    _authorize();
    _setLimitOrderManager(newModule);
    emit LimitOrderManager(newModule);
  }
}
