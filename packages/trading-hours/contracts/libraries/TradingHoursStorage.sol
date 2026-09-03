// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for Trading Hours plugin (used by connector + implementation).
library TradingHoursStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.tradingHours")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x157c7dea278f3c107451783254029433caceac4c3bcaa5b98e6916d4d8687100;

  struct Layout {
    // UTC seconds from midnight, inclusive
    uint32 tradingStartSeconds;
    // UTC seconds from midnight, exclusive
    uint32 tradingEndSeconds;
    // used only to find the local calendar day for the hardcoded Sat/Sun rule, local = UTC + offset
    int32 weekendOffsetSeconds;
    // while false, trading is fully unrestricted, including the weekend rule. Checked directly by the
    // connector before it even delegatecalls into verifyTrading, so a disabled pool skips that call entirely
    bool enabled;
    // key is the UTC timestamp of the start of the day (TradingHoursLib.dayStart) - "day" is a comment-only
    // concept, never a separate index type. Value is up to 5 packed (start,end) uint24 windows, UTC
    // seconds-of-day, for holidays and temporary closures. Slots must be filled contiguously from index 0,
    // see TradingHoursLib
    mapping(uint256 => uint256) blockedWindows;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
