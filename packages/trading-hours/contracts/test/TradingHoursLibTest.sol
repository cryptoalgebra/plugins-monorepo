// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../libraries/TradingHoursLib.sol';

/// @title Trading Hours library constants for tests
/// @notice Exposes the library's internal constants so specs can check the values they hardcode
/// @dev A spec that writes 86400 or loops over five slots keeps passing if one of those is ever
/// retuned, while quietly testing the wrong shape. Reading them from here makes that a failure
contract TradingHoursLibTest {
  function secondsPerDay() external pure returns (uint256) {
    return TradingHoursLib.SECONDS_PER_DAY;
  }

  function maxBlockedWindowsPerDay() external pure returns (uint8) {
    return TradingHoursLib.MAX_BLOCKED_WINDOWS_PER_DAY;
  }
}
