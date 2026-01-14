// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

interface IMevxRouter {
	function initializePool(bytes32 poolId, uint16 poolType, bytes memory data) external;

	function constructArbitrageRoute(
		bytes32 poolId,
		bool zeroToOne,
		int256 amount0,
		int256 amount1
	)
		external
		returns (
			bool isArbPossible,
			address profitToken,
			address[] memory pools,
			uint256 optimalAmountIn,
			bytes memory encodedRoute
		);
}