// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../contracts/libraries/VolatilityOracle.sol';

/// @notice Halmos specs for the timestamp comparator, holding for every input
contract VolatilityOracleSpec {
  /// @dev Real times are uint64. The documented precondition is that a and b are not after now
  /// and at most one 2^32 wrap behind it.
  function check_lteConsideringOverflowMatchesRealTimeOrder(uint64 now_, uint32 agoA, uint32 agoB) public pure {
    require(now_ >= type(uint32).max);
    uint64 a = now_ - agoA;
    uint64 b = now_ - agoB;
    assert(VolatilityOracle._lteConsideringOverflow(uint32(a), uint32(b), uint32(now_)) == (a <= b));
  }
}
