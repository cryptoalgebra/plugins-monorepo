// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock Security Registry for testing
/// @notice Simplified mock of ISecurityRegistry for unit tests
contract MockSecurityRegistry {
  enum Status {
    ENABLED,
    BURN_ONLY,
    DISABLED
  }

  mapping(address => Status) private _poolStatuses;

  function setPoolStatus(address pool, Status status) external {
    _poolStatuses[pool] = status;
  }

  function getPoolStatus(address pool) external view returns (Status) {
    return _poolStatuses[pool];
  }
}
