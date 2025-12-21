// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev Shared namespaced storage for upgrade test (used by MockUpgradedPlugin).
library UpgradeTestStorage {
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.upgradetest');

  struct Layout {
    uint256 newVariable;
    bool upgraded;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
