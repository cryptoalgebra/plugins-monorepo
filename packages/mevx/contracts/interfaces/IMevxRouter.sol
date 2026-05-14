// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

interface IMevxRouter {
	function initializePool(bytes32 poolId, uint16 poolType, bytes memory data) external;
	function initializePoolExternally(bytes32 poolId, uint16 poolType, bytes memory data) external;

	function initialArbCheck(bytes32 poolId, bool zeroToOne) external returns (bool isArbPossible, bytes16 arbData);

	function constructArbitrageRoute(
		bytes32 poolId,
		bool zeroToOne,
		bytes16 arbData,
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
