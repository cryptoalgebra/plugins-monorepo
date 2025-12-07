// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/safety-switch-plugin/contracts/interfaces/ISecurityRegistry.sol';

/// @title Mock Security Registry for testing
/// @notice Simplified registry without access control for testing purposes
contract MockSecurityRegistry is ISecurityRegistry {
    Status public override globalStatus;
    mapping(address => Status) public poolStatus;
    bool public override isPoolStatusOverrided;

    function algebraFactory() external pure override returns (address) {
        return address(0);
    }

    function GUARD() external pure override returns (bytes32) {
        return keccak256('GUARD');
    }

    function setGlobalStatus(Status newStatus) external override {
        globalStatus = newStatus;
        emit GlobalStatus(newStatus);
    }

    function setPoolsStatus(address[] memory pools, Status[] memory newStatuses) external override {
        for (uint i = 0; i < pools.length; i++) {
            poolStatus[pools[i]] = newStatuses[i];
            emit PoolStatus(pools[i], newStatuses[i]);
        }
        _updateOverrideFlag();
    }

    function getPoolStatus(address pool) external view override returns (Status) {
        Status _globalStatus = globalStatus;
        
        // If global is not ENABLED, it takes priority
        if (_globalStatus != Status.ENABLED) {
            return _globalStatus;
        }
        
        // If pool has override, return pool status
        if (isPoolStatusOverrided && poolStatus[pool] != Status.ENABLED) {
            return poolStatus[pool];
        }
        
        return Status.ENABLED;
    }

    function _updateOverrideFlag() internal {
        // Simple check - just see if any non-ENABLED status exists
        isPoolStatusOverrided = true;
    }

    /// @notice Reset pool status to ENABLED (test helper)
    function resetPoolStatus(address pool) external {
        poolStatus[pool] = Status.ENABLED;
    }
}
