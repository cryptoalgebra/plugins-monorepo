// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../../AlgebraUpgradeablePlugin.sol';
import '../utils/UpgradeTestStorage.sol';

/// @title Mock Upgraded Plugin for testing upgrades
/// @notice This contract simulates an upgraded version of AlgebraUpgradeablePlugin
/// @dev Adds a new variable and function to verify upgrade works correctly
contract MockUpgradedPlugin is AlgebraUpgradeablePlugin {
  constructor(
    address _factory,
    address _pluginFactory,
    PluginImplementations memory _impls
  )
    AlgebraUpgradeablePlugin(_factory, _pluginFactory, _impls)
  {}

  /// @notice New function only available in upgraded version
  /// @return Always returns 42 to verify upgrade works
  function newUpgradeableFunction() external pure returns (uint256) {
    return 42;
  }

  /// @notice Set new variable (only available in upgraded version)
  function setNewVariable(uint256 value) external {
    _authorize();
    UpgradeTestStorage.layout().newVariable = value;
  }

  /// @notice Get new variable
  function getNewVariable() external view returns (uint256) {
    return UpgradeTestStorage.layout().newVariable;
  }

  /// @notice Check if this is the upgraded implementation
  /// @dev Always returns true because this IS the upgraded contract
  function isUpgraded() external pure returns (bool) {
    return true;
  }
}
