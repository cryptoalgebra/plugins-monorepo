// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../AlgebraUpgradeablePlugin.sol';

/// @title Mock Upgraded Plugin for testing upgrades
/// @notice This contract simulates an upgraded version of AlgebraUpgradeablePlugin
/// @dev Adds a new variable and function to verify upgrade works correctly
contract MockUpgradedPlugin is AlgebraUpgradeablePlugin {
  /// @dev ERC-7201 namespace for upgrade test storage
  bytes32 internal constant UPGRADE_TEST_NAMESPACE = keccak256('algebra.storage.upgradetest');

  struct UpgradeTestLayout {
    uint256 newVariable;
    bool upgraded;
  }

  /// @dev Fetch pointer of upgrade test storage
  function _getUpgradeTestLayout() internal pure returns (UpgradeTestLayout storage layout) {
    bytes32 position = UPGRADE_TEST_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl
  )
    AlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl
    )
  {}

  /// @notice New function only available in upgraded version
  /// @return Always returns 42 to verify upgrade works
  function newUpgradeableFunction() external pure returns (uint256) {
    return 42;
  }

  /// @notice Set new variable (only available in upgraded version)
  function setNewVariable(uint256 value) external {
    _authorize();
    UpgradeTestLayout storage layout = _getUpgradeTestLayout();
    layout.newVariable = value;
  }

  /// @notice Get new variable
  function getNewVariable() external view returns (uint256) {
    UpgradeTestLayout storage layout = _getUpgradeTestLayout();
    return layout.newVariable;
  }

  /// @notice Check if this is the upgraded implementation
  /// @dev Always returns true because this IS the upgraded contract
  function isUpgraded() external pure returns (bool) {
    return true;
  }
}
