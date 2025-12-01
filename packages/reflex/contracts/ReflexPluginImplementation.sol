// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IReflexRouter.sol';

/// @title Reflex Plugin Implementation
/// @notice This contract contains ALL logic for Reflex plugin that works with namespaced storage
/// @dev Called via delegatecall from ReflexConnector to reduce main contract size
contract ReflexPluginImplementation {
  /// @dev Storage namespace for Reflex plugin using ERC-7201
  bytes32 internal constant REFLEX_NAMESPACE = keccak256('algebra.storage.reflex');

  struct ReflexLayout {
    address reflexRouter;
    bytes32 reflexConfigId;
  }

  /// @dev Fetch pointer of Reflex plugin's storage
  function _getReflexLayout() internal pure returns (ReflexLayout storage layout) {
    bytes32 position = REFLEX_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  /// @notice Initialize Reflex plugin
  /// @dev Called via delegatecall from connector
  /// @param _router Address of reflex router
  /// @param _configId Configuration ID for profit distribution
  function initializeReflex(address _router, bytes32 _configId) external {
    require(_router != address(0), 'Invalid router address');
    ReflexLayout storage layout = _getReflexLayout();
    layout.reflexRouter = _router;
    layout.reflexConfigId = _configId;
  }

  /// @notice Set reflex router
  /// @dev Called via delegatecall from connector
  /// @param _router New router address
  function setReflexRouter(address _router) external {
    require(_router != address(0), 'Invalid router address');
    ReflexLayout storage layout = _getReflexLayout();
    layout.reflexRouter = _router;
  }

  /// @notice Set reflex config ID
  /// @dev Called via delegatecall from connector
  /// @param _configId New config ID
  function setReflexConfigId(bytes32 _configId) external {
    ReflexLayout storage layout = _getReflexLayout();
    layout.reflexConfigId = _configId;
  }

  /// @notice Get reflex router
  /// @dev Called via staticcall from connector
  /// @return Router address
  function getReflexRouter() external view returns (address) {
    ReflexLayout storage layout = _getReflexLayout();
    return layout.reflexRouter;
  }

  /// @notice Get reflex config ID
  /// @dev Called via staticcall from connector
  /// @return Config ID
  function getReflexConfigId() external view returns (bytes32) {
    ReflexLayout storage layout = _getReflexLayout();
    return layout.reflexConfigId;
  }

  /// @notice Execute reflex after swap
  /// @dev Called via delegatecall from connector
  /// @param triggerPoolId Unique identifier for the pool that triggered the swap
  /// @param amount0Delta The change in token0 balance from the original swap
  /// @param amount1Delta The change in token1 balance from the original swap
  /// @param zeroForOne Direction of the original swap
  /// @param recipient Address that should receive the extracted profits
  /// @return profit Amount of profit extracted
  /// @return profitToken Address of the token in which profit was extracted
  function reflexAfterSwap(
    bytes32 triggerPoolId,
    int256 amount0Delta,
    int256 amount1Delta,
    bool zeroForOne,
    address recipient
  ) external returns (uint256 profit, address profitToken) {
    ReflexLayout storage layout = _getReflexLayout();

    uint256 swapAmountIn = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);

    // Failsafe: Use try-catch to prevent router failures from breaking the main swap
    try
      IReflexRouter(layout.reflexRouter).triggerBackrun(
        triggerPoolId,
        uint112(swapAmountIn),
        zeroForOne,
        recipient,
        layout.reflexConfigId
      )
    returns (uint256 backrunProfit, address backrunProfitToken) {
      return (backrunProfit, backrunProfitToken);
    } catch {
      // Router call failed, but don't revert the main transaction
    }

    return (0, address(0));
  }
}
