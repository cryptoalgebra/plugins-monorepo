// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import './UpgradeableTradingHoursPluginTest.sol';

/// @dev Namespace of a module that does not exist yet, used to prove that a later module writing its
/// own storage cannot disturb the trading-hours fields already stored in a live proxy.
library UpgradeTestStorage {
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.tradinghours.upgradetest');

  struct Layout {
    uint256 newVariable;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}

/// @title Upgraded Trading Hours Plugin for Testing
/// @notice Stands in for a future version of the plugin put behind the same beacon
/// @dev Keeps every inherited function and adds one field of its own, so an upgrade spec can check
/// both that the old storage survived and that the new implementation is really the one running
contract UpgradedTradingHoursPluginTest is UpgradeableTradingHoursPluginTest {
  constructor(
    address _factory,
    address _pluginFactory,
    address _tradingHoursImplementation
  ) UpgradeableTradingHoursPluginTest(_factory, _pluginFactory, _tradingHoursImplementation) {}

  function isUpgraded() external pure returns (bool) {
    return true;
  }

  function setNewVariable(uint256 value) external {
    _authorize();
    UpgradeTestStorage.layout().newVariable = value;
  }

  function getNewVariable() external view returns (uint256) {
    return UpgradeTestStorage.layout().newVariable;
  }
}
