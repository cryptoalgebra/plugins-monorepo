// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IRebalanceManager {
	event SetPriceShiftTrigger(uint16 priceShiftTrigger);
	event SetRangeParams(uint16 baseRangeLower, uint16 baseRangeUpper, uint16 limitAllocation);
	event SetInventoryLevels(uint16 maxDepositRatio, uint16 balancedStateMin, uint16 lowInventoryLevel, uint16 highInventoryLevel);
	event SetRatioBuffer(uint16 ratioBuffer);
	event SetMajorDeviation(uint16 majorDeviation);
	event SetMinorDeviation(uint16 minorDeviation);
	event SetCriticalDeviation(uint16 criticalDeviation);
	event SetIdleDepositRatio(uint16 idleDepositRatio);
	event SetMinTimeBetweenRebalances(uint32 minTimeBetweenRebalances);
	event SetVault(address vault);
	event Paused();
	event Unpaused();

	function obtainTWAPAndRebalance(
		int24 currentTick,
        int24 slowTwapTick,
        int24 fastTwapTick,
        uint32 lastBlockTimestamp
	) external;
}
