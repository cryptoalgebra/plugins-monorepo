// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

/// @title Mock of the Algebra security registry for plugins testing
/// @notice Simplified registry without access control
/// @dev Shared test contract - import from @cryptoalgebra/test-utils
/// @dev ABI matches ISecurityRegistry, the interface is not inherited to keep test-utils below the plugin packages
/// @dev No compile time check enforces that, keep this in sync whenever ISecurityRegistry changes
contract MockSecurityRegistry {
  enum Status {
    ENABLED,
    BURN_ONLY,
    DISABLED
  }

  event GlobalStatus(Status status);
  event PoolStatus(address pool, Status status);

  Status public globalStatus;
  bool public isPoolStatusOverrided;
  mapping(address => Status) public poolStatus;

  function algebraFactory() external pure returns (address) {
    return address(0);
  }

  function GUARD() external pure returns (bytes32) {
    return keccak256('GUARD');
  }

  function setGlobalStatus(Status newStatus) external {
    globalStatus = newStatus;
    emit GlobalStatus(newStatus);
  }

  function setPoolsStatus(address[] memory pools, Status[] memory newStatuses) external {
    for (uint i = 0; i < pools.length; i++) {
      poolStatus[pools[i]] = newStatuses[i];
      emit PoolStatus(pools[i], newStatuses[i]);
    }
    isPoolStatusOverrided = true;
  }

  /// @notice Single pool variant, kept for tests that do not need the batch form
  function setPoolStatus(address pool, Status status) external {
    poolStatus[pool] = status;
    isPoolStatusOverrided = true;
    emit PoolStatus(pool, status);
  }

  function getPoolStatus(address pool) external view returns (Status) {
    Status _globalStatus = globalStatus;

    // Global status takes priority while it is not ENABLED
    if (_globalStatus != Status.ENABLED) return _globalStatus;

    if (isPoolStatusOverrided && poolStatus[pool] != Status.ENABLED) return poolStatus[pool];

    return Status.ENABLED;
  }

  /// @notice Reset pool status to ENABLED (test helper)
  function resetPoolStatus(address pool) external {
    poolStatus[pool] = Status.ENABLED;
  }
}
