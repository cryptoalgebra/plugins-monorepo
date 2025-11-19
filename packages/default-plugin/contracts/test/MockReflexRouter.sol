// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '@cryptoalgebra/reflex-plugin/contracts/interfaces/IReflexRouter.sol';
import '@cryptoalgebra/safety-switch-plugin/contracts/SecurityRegistry.sol';

/// @title Mock Reflex Router for testing
contract MockReflexRouter is IReflexRouter {
    address public admin;
    
    uint256 public lastProfit;
    address public lastProfitToken;
    bytes32 public lastTriggerPoolId;
    uint112 public lastSwapAmountIn;
    bool public lastToken0In;
    address public lastRecipient;
    bytes32 public lastConfigId;

    bool public shouldRevert;
    uint256 public profitToReturn;
    address public profitTokenToReturn;

    constructor() {
        admin = msg.sender;
    }

    /// @inheritdoc IReflexRouter
    function triggerBackrun(
        bytes32 triggerPoolId,
        uint112 swapAmountIn,
        bool token0In,
        address recipient,
        bytes32 configId
    ) external override returns (uint256 profit, address profitToken) {
        if (shouldRevert) {
            revert("MockReflexRouter: forced revert");
        }

        lastTriggerPoolId = triggerPoolId;
        lastSwapAmountIn = swapAmountIn;
        lastToken0In = token0In;
        lastRecipient = recipient;
        lastConfigId = configId;

        profit = profitToReturn;
        profitToken = profitTokenToReturn;

        lastProfit = profit;
        lastProfitToken = profitToken;

        emit BackrunExecuted(triggerPoolId, swapAmountIn, token0In, 0, profit, profitToken, recipient);

        return (profit, profitToken);
    }

    /// @inheritdoc IReflexRouter
    function backrunedExecute(
        ExecuteParams calldata /* executeParams */,
        BackrunParams[] calldata /* backrunParams */
    ) external payable override returns (
        bool /* success */,
        bytes memory /* returnData */,
        uint256[] memory /* profits */,
        address[] memory /* profitTokens */
    ) {
        // Not implemented for mock
        revert("Not implemented");
    }

    /// @inheritdoc IReflexRouter
    function getReflexAdmin() external view override returns (address) {
        return admin;
    }

    // Test helper functions
    function setAdmin(address _admin) external {
        admin = _admin;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setProfitReturn(uint256 _profit, address _profitToken) external {
        profitToReturn = _profit;
        profitTokenToReturn = _profitToken;
    }

    function getLastBackrunData() external view returns (
        bytes32 triggerPoolId,
        uint112 swapAmountIn,
        bool token0In,
        address recipient,
        bytes32 configId
    ) {
        return (lastTriggerPoolId, lastSwapAmountIn, lastToken0In, lastRecipient, lastConfigId);
    }
}
