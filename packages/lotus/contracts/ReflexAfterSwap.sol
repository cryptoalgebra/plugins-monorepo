// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReflexRouter.sol";
import "./base/FundsSplitter.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReflexAfterSwap
/// @notice Abstract contract that integrates with Reflex Router for post-swap profit extraction and distribution
/// @dev Inherits from FundsSplitter to enable profit sharing among multiple recipients
/// @dev Implements failsafe mechanisms to prevent router failures from affecting main swap operations
abstract contract ReflexAfterSwap is FundsSplitter, ReentrancyGuard {
    /// @notice Address of the Reflex router contract
    address router;

    /// @notice Address of the reflex admin (authorized controller)
    address reflexAdmin;

    /// @notice Constructor to initialize the ReflexAfterSwap contract
    /// @param _router Address of the Reflex router contract
    /// @dev Validates router address and fetches the admin from the router
    constructor(address _router) {
        require(_router != address(0), "Invalid router address");
        router = _router;
        reflexAdmin = IReflexRouter(_router).getReflexAdmin();
    }

    /// @notice Modifier to restrict access to reflex admin only
    /// @dev Reverts with "Not authorized" if caller is not the reflex admin
    modifier onlyReflexAdmin() {
        _onlyFundsAdmin();
        _;
    }

    function _onlyFundsAdmin() internal view virtual override {
        require(msg.sender == reflexAdmin, "Caller is not the reflex admin");
    }

    /// @notice Updates the Reflex router address and refreshes admin
    /// @param _router New router address to set
    /// @dev Only callable by current reflex admin, validates non-zero address, and updates admin from new router
    function setReflexRouter(address _router) external onlyReflexAdmin {
        require(_router != address(0), "Invalid router address");
        router = _router;
        reflexAdmin = IReflexRouter(_router).getReflexAdmin();
    }

    /// @notice Returns the current router address
    /// @return The address of the current Reflex router contract
    function getRouter() external view returns (address) {
        return router;
    }

    /// @notice Get the current reflex admin address
    /// @return The address of the current reflex admin
    function getReflexAdmin() external view returns (address) {
        return reflexAdmin;
    }

    /// @notice Main entry point for post-swap profit extraction via backrunning
    /// @param triggerPoolId Unique identifier for the pool that triggered the swap
    /// @param amount0Delta The change in token0 balance from the original swap
    /// @param amount1Delta The change in token1 balance from the original swap
    /// @param zeroForOne Direction of the original swap (true if token0 -> token1)
    /// @param recipient Address that should receive the extracted profits
    /// @return profit Amount of profit extracted and distributed
    /// @dev Internal function with reentrancy protection using OpenZeppelin's ReentrancyGuard
    /// @dev Uses try-catch for failsafe operation and delegates profit distribution to _splitERC20
    function reflexAfterSwap(
        bytes32 triggerPoolId,
        int256 amount0Delta,
        int256 amount1Delta,
        bool zeroForOne,
        address recipient
    ) internal nonReentrant returns (uint256 profit) {
        uint256 swapAmountIn = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);

        // Failsafe: Use try-catch to prevent router failures from breaking the main swap
        try IReflexRouter(router).triggerBackrun(triggerPoolId, uint112(swapAmountIn), zeroForOne, address(this))
        returns (uint256 backrunProfit, address profitToken) {
            if (backrunProfit > 0 && profitToken != address(0)) {
                _splitERC20(profitToken, backrunProfit, recipient);
                return backrunProfit;
            }
        } catch {
            // Router call failed, but don't revert the main transaction
            // This ensures the main swap can still complete successfully
        }

        return 0;
    }
}