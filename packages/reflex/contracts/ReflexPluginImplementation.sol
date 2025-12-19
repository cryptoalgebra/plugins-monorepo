// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IReflexRouter.sol';
import './interfaces/IReflexPluginImplementation.sol';
import './libraries/ReflexStorage.sol';

/// @title Reflex Plugin Implementation
/// @notice This contract contains ALL logic for Reflex plugin that works with namespaced storage
/// @dev Called via delegatecall from ReflexConnector to reduce main contract size
contract ReflexPluginImplementation is IReflexPluginImplementation {

  /// @notice Initialize Reflex plugin
  /// @param _router Address of reflex router
  /// @param _configId Configuration ID for profit distribution
  function initializeReflex(address _router, bytes32 _configId) external {
    require(_router != address(0), 'Invalid router address');
    ReflexStorage.Layout storage layout = ReflexStorage.layout();
    layout.reflexRouter = _router;
    layout.reflexConfigId = _configId;
  }

  /// @notice Set reflex router
  /// @param _router New router address
  function setReflexRouter(address _router) external {
    require(_router != address(0), 'Invalid router address');
    ReflexStorage.Layout storage layout = ReflexStorage.layout();
    layout.reflexRouter = _router;
  }

  /// @notice Set reflex config ID
  /// @param _configId New config ID
  function setReflexConfigId(bytes32 _configId) external {
    ReflexStorage.Layout storage layout = ReflexStorage.layout();
    layout.reflexConfigId = _configId;
  }

  /// @notice Get reflex router
  /// @return Router address
  function getReflexRouter() external view returns (address) {
    return ReflexStorage.layout().reflexRouter;
  }

  /// @notice Get reflex config ID
  /// @return Config ID
  function getReflexConfigId() external view returns (bytes32) {
    return ReflexStorage.layout().reflexConfigId;
  }

  /// @notice Execute reflex after swap
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
    ReflexStorage.Layout storage layout = ReflexStorage.layout();

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
