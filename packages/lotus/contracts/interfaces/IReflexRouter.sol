// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReflexRouter {
    /// @notice Struct for execute call parameters
    /// @param target The address of the contract to call
    /// @param value The amount of ETH (in wei) to send with the call
    /// @param callData The calldata to execute on the target contract
    struct ExecuteParams {
        address target;
        uint256 value;
        bytes callData;
    }

    /// @notice Struct for backrun trigger parameters
    /// @param triggerPoolId The pool ID to trigger the backrun on
    /// @param swapAmountIn The amount to swap in
    /// @param token0In Whether token0 is being swapped in
    /// @param recipient The address to receive the profit
    /// @param configId The configuration ID for profit splitting (optional, uses default if not provided)
    struct BackrunParams {
        bytes32 triggerPoolId;
        uint112 swapAmountIn;
        bool token0In;
        address recipient;
        bytes32 configId;
    }

    /// @notice Triggers a backrun swap the profit created by the swap.
    /// @param triggerPoolId The pool ID to trigger the backrun on.
    /// @param swapAmountIn The amount to swap in.
    /// @param token0In Whether token0 is being swapped in.
    /// @param recipient The address to receive the profit.
    /// @param configId The configuration ID for profit splitting (optional, uses default if bytes32(0)).
    /// @return  profit The profit made from the backrun swap.
    function triggerBackrun(
        bytes32 triggerPoolId,
        uint112 swapAmountIn,
        bool token0In,
        address recipient,
        bytes32 configId
    ) external returns (uint256 profit, address profitToken);

    /// @notice Executes arbitrary calldata on a target contract and then triggers multiple backruns.
    /// @param executeParams The parameters for the execute call (target, value, callData).
    /// @param backrunParams Array of parameters for each backrun trigger.
    /// @return success Whether the initial call was successful.
    /// @return returnData The return data from the initial call.
    /// @return profits Array of profits made from each backrun swap.
    /// @return profitTokens Array of tokens in which profits were made.
    function backrunedExecute(ExecuteParams calldata executeParams, BackrunParams[] calldata backrunParams)
        external
        payable
        returns (bool success, bytes memory returnData, uint256[] memory profits, address[] memory profitTokens);

    /// @notice Returns the admin/owner address of the Reflex router.
    /// @return The address of the admin/owner.
    function getReflexAdmin() external view returns (address);

    /// @notice Emitted when a backrun is executed
    /// @param triggerPoolId The pool ID that triggered the backrun
    /// @param swapAmountIn The amount swapped in
    /// @param token0In Whether token0 was being swapped in
    /// @param profit The profit made from the backrun
    /// @param profitToken The token in which profit was made
    /// @param recipient The address that received the profit
    event BackrunExecuted(
        bytes32 indexed triggerPoolId,
        uint112 swapAmountIn,
        bool token0In,
        uint256 quoteProfit,
        uint256 profit,
        address profitToken,
        address indexed recipient
    );
}
