// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReflexRouter.sol";

/// @title ReflexAfterSwap
/// @notice Abstract contract that integrates with Reflex Router for post-swap profit extraction
/// @dev Implements failsafe mechanisms to prevent router failures from affecting main swap operations
/// @dev Profit distribution is handled externally - this contract only extracts profits
abstract contract ReflexAfterSwap {
    // ========== Events ==========

    /// @notice Emitted when the Reflex router address is updated
    /// @param oldRouter The address of the previous router contract
    /// @param newRouter The address of the new router contract
    event ReflexRouterUpdated(address oldRouter, address newRouter);

    /// @notice Emitted when the Reflex configuration ID is updated
    /// @param oldConfigId The previous configuration ID
    /// @param newConfigId The new configuration ID
    event ReflexConfigIdUpdated(bytes32 oldConfigId, bytes32 newConfigId);

    // ========== State Variables ==========

    /// @notice Address of the Reflex router contract
    address reflexRouter;

    /// @notice Configuration ID for profit distribution
    bytes32 reflexConfigId;

    /// @notice Constructor to initialize the ReflexAfterSwap contract
    /// @param _router Address of the Reflex router contract
    /// @param _configId Configuration ID for profit distribution
    /// @dev Validates router address and fetches the admin from the router
    constructor(address _router, bytes32 _configId) {
        require(_router != address(0), "Invalid router address");
        reflexRouter = _router;
        reflexConfigId = _configId;
    }

    /// @notice Internal function that must be implemented by child contract to enforce admin access control
    function _onlyReflexAdmin() internal view virtual;

    /// @notice Updates the Reflex router address and refreshes admin
    /// @param _router New router address to set
    /// @dev Only callable by current reflex admin, validates non-zero address, and updates admin from new router
    function setReflexRouter(address _router) external {
        _onlyReflexAdmin();
        require(_router != address(0), "Invalid router address");
        address oldRouter = reflexRouter;
        reflexRouter = _router;
        emit ReflexRouterUpdated(oldRouter, _router);
    }

    /// @notice Returns the current router address
    /// @return The address of the current Reflex router contract
    function getRouter() public view returns (address) {
        return reflexRouter;
    }

    /// @notice Get the current configuration ID for profit distribution
    /// @return The current configuration ID
    function getConfigId() external view returns (bytes32) {
        return reflexConfigId;
    }

    /// @notice Updates the configuration ID for profit distribution
    /// @param _configId New configuration ID to set
    /// @dev Only callable by current reflex admin
    function setReflexConfigId(bytes32 _configId) external {
        _onlyReflexAdmin();
        bytes32 oldConfigId = reflexConfigId;
        reflexConfigId = _configId;
        emit ReflexConfigIdUpdated(oldConfigId, _configId);
    }

    /// @notice Main entry point for post-swap profit extraction via backrunning
    /// @param triggerPoolId Unique identifier for the pool that triggered the swap
    /// @param amount0Delta The change in token0 balance from the original swap
    /// @param amount1Delta The change in token1 balance from the original swap
    /// @param zeroForOne Direction of the original swap (true if token0 -> token1)
    /// @param recipient Address that should receive the extracted profits
    /// @return profit Amount of profit extracted
    /// @return profitToken Address of the token in which profit was extracted
    /// @dev Internal function with reentrancy protection using graceful reentrancy guard
    /// @dev Uses try-catch for failsafe operation - router failures won't break main swap
    /// @dev Profit distribution is handled externally - this contract only extracts profits
    function _reflexAfterSwap(
        bytes32 triggerPoolId,
        int256 amount0Delta,
        int256 amount1Delta,
        bool zeroForOne,
        address recipient
    ) internal returns (uint256 profit, address profitToken) {
        uint256 swapAmountIn = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);

        // Failsafe: Use try-catch to prevent router failures from breaking the main swap
        try IReflexRouter(reflexRouter).triggerBackrun(
            triggerPoolId, uint112(swapAmountIn), zeroForOne, recipient, reflexConfigId
        ) returns (uint256 backrunProfit, address backrunProfitToken) {
            return (backrunProfit, backrunProfitToken);
        } catch {
            // Router call failed, but don't revert the main transaction
            // This ensures the main swap can still complete successfully
        }

        return (0, address(0));
    }
}