// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev V2 surface each upgraded module mock adds on top of the shipped implementation.
/// @dev The plugin level accessors encode against these, so a renamed mock function breaks at compile time
/// @dev instead of falling through to the fallback and reverting somewhere inside a test.

interface IMockV2VolatilityOracle {
  function setEnhancedMode(bool enabled) external;

  function getEnhancedMode() external view returns (bool);

  function isUpgradedVolatilityImpl() external pure returns (bool);
}

interface IMockV2DynamicFee {
  function setAdvancedMode(bool enabled) external;

  function getAdvancedMode() external view returns (bool);

  function isUpgradedDynamicFeeImpl() external pure returns (bool);
}

interface IMockV2FarmingProxy {
  function setPausedMode(bool enabled) external;

  function getPausedMode() external view returns (bool);

  function getUpdateStats() external view returns (uint256 updateCount, uint256 lastUpdateTimestamp);

  function isUpgradedFarmingImpl() external pure returns (bool);
}

interface IMockV2Alm {
  function setAdvancedMode(bool enabled) external;

  function getAdvancedMode() external view returns (bool);

  function isUpgradedAlmImpl() external pure returns (bool);
}

interface IMockV2Security {
  function setEmergencyMode(bool enabled) external;

  function getEmergencyMode() external view returns (bool);

  function getCheckStats() external view returns (uint256 checkCount, uint256 lastCheckTimestamp);

  function isUpgradedSecurityImpl() external pure returns (bool);
}
