// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

interface IProfitDistributor {
	struct ProfitShareConfig {
		address[] recipients;
		uint256[] shares;
		uint256 swapRecipientShare;
	}

	function distributeProfit(bytes32 configId, address token, address swapRecipient) external;
}