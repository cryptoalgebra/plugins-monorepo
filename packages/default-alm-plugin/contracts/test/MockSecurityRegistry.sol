// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityRegistry.sol';

contract MockSecurityRegistry is ISecurityRegistry {
  address public override algebraFactory;
  Status public override globalStatus;
  bool public override isPoolStatusOverrided;

  mapping(address => Status) private poolStatus;

  bytes32 public constant override GUARD = keccak256("GUARD");

  constructor(address _algebraFactory) {
    algebraFactory = _algebraFactory;
    globalStatus = Status.ENABLED;
  }

  function setGlobalStatus(Status newStatus) external override {
    globalStatus = newStatus;
    emit GlobalStatus(newStatus);
  }

  function getPoolStatus(address pool) external view override returns (Status) {
    Status poolStat = poolStatus[pool];
    if (poolStat == Status.ENABLED) {
      return globalStatus;
    }
    return poolStat;
  }

  function setPoolsStatus(address[] memory pools, Status[] memory newStatuses) external override {
    require(pools.length == newStatuses.length, "Arrays length mismatch");
    for (uint i = 0; i < pools.length; i++) {
      poolStatus[pools[i]] = newStatuses[i];
      emit PoolStatus(pools[i], newStatuses[i]);
    }
  }
}
