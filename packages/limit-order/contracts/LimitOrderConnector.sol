// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/abstract-plugin/contracts/BaseConnector.sol';
import './interfaces/ILimitOrderPlugin.sol';
import './interfaces/ILimitOrderPluginImplementation.sol';
import './libraries/LimitOrderStorage.sol';

/// @title LimitOrder Connector
/// @notice This contract provides delegatecall functions to LimitOrder implementation
abstract contract LimitOrderConnector is ILimitOrderPlugin, BaseConnector {
  using Plugins for uint8;

  string internal constant LIMIT_ORDER_MODULE_NAME = 'Limit Order Plugin';
  uint8 internal constant LIMIT_ORDER_PLUGIN_CONFIG = uint8(Plugins.AFTER_SWAP_FLAG);

  /// @dev Immutable implementation address - set in constructor, changes only on full plugin upgrade
  address internal immutable limitOrderImplementation;

  constructor(address _limitOrderImplementation) {
    limitOrderImplementation = _limitOrderImplementation;
  }

  /// @notice Initialize LimitOrder plugin with manager address via delegatecall
  function _initializeLimitOrder(
    address _limitOrderManager
  ) internal {
    _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.initializeLimitOrder, (_limitOrderManager))
    );
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
  function limitOrderManager() external view override returns (address) {
    return LimitOrderStorage.layout().limitOrderManager;
  }

  /// @inheritdoc ILimitOrderPlugin
  function setLimitOrderManager(address manager) external override {
    _authorize();
    _delegateCall(
      limitOrderImplementation,
      abi.encodeCall(ILimitOrderPluginImplementation.setLimitOrderManager, (manager))
    );
    emit LimitOrderManager(manager);
  }
}
