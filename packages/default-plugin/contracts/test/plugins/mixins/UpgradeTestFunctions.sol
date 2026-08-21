// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../../utils/UpgradeTestStorage.sol';

/// @dev Functions an upgraded plugin gains, shared by the timed and untimed upgrade mocks.
/// @dev Authorization is a hook so mixing this in adds no connector override boilerplate.
abstract contract UpgradeTestFunctions {
  function _upgradeTestAuthorize() internal view virtual;

  /// @notice New function only available in upgraded version
  /// @return Always returns 42 to verify upgrade works
  function newUpgradeableFunction() external pure returns (uint256) {
    return 42;
  }

  /// @notice Set new variable (only available in upgraded version)
  function setNewVariable(uint256 value) external {
    _upgradeTestAuthorize();
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
