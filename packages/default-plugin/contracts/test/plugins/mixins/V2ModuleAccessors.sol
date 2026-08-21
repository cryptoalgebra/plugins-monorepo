// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../../interfaces/IMockV2Modules.sol';

/// @dev Wiring every V2 accessor mixin needs from the plugin it is mixed into.
/// @dev Declared as hooks instead of inheriting the connectors, so mixing them in adds no override boilerplate.
abstract contract V2AccessorsBase {
  function _v2Authorize() internal view virtual;

  function _v2Call(address implementation, bytes memory data) internal virtual returns (bytes memory);
}

/// @dev Plugin level accessors for the V2 functions of MockUpgradedVolatilityOraclePluginImplementation.
abstract contract V2VolatilityAccessors is V2AccessorsBase {
  bool public constant HAS_UPGRADED_VOLATILITY = true;

  function _v2VolatilityImpl() internal view virtual returns (address);

  function setVolatilityEnhancedMode(bool enabled) external {
    _v2Authorize();
    _v2Call(_v2VolatilityImpl(), abi.encodeCall(IMockV2VolatilityOracle.setEnhancedMode, (enabled)));
  }

  function getVolatilityEnhancedMode() external returns (bool) {
    bytes memory data = abi.encodeCall(IMockV2VolatilityOracle.getEnhancedMode, ());
    return abi.decode(_v2Call(_v2VolatilityImpl(), data), (bool));
  }

  function hasUpgradedVolatilityImpl() external returns (bool) {
    bytes memory data = abi.encodeCall(IMockV2VolatilityOracle.isUpgradedVolatilityImpl, ());
    return abi.decode(_v2Call(_v2VolatilityImpl(), data), (bool));
  }
}

/// @dev Plugin level accessors for the V2 functions of MockUpgradedDynamicFeePluginImplementation.
abstract contract V2DynamicFeeAccessors is V2AccessorsBase {
  bool public constant HAS_UPGRADED_DYNAMIC_FEE = true;

  function _v2DynamicFeeImpl() internal view virtual returns (address);

  function setAdvancedFeeMode(bool enabled) external {
    _v2Authorize();
    _v2Call(_v2DynamicFeeImpl(), abi.encodeCall(IMockV2DynamicFee.setAdvancedMode, (enabled)));
  }

  function getAdvancedFeeMode() external returns (bool) {
    return abi.decode(_v2Call(_v2DynamicFeeImpl(), abi.encodeCall(IMockV2DynamicFee.getAdvancedMode, ())), (bool));
  }

  function hasUpgradedDynamicFeeImpl() external returns (bool) {
    bytes memory data = abi.encodeCall(IMockV2DynamicFee.isUpgradedDynamicFeeImpl, ());
    return abi.decode(_v2Call(_v2DynamicFeeImpl(), data), (bool));
  }
}

/// @dev Plugin level accessors for the V2 functions of MockUpgradedFarmingProxyPluginImplementation.
abstract contract V2FarmingAccessors is V2AccessorsBase {
  bool public constant HAS_UPGRADED_FARMING = true;

  function _v2FarmingImpl() internal view virtual returns (address);

  function setFarmingPausedMode(bool enabled) external {
    _v2Authorize();
    _v2Call(_v2FarmingImpl(), abi.encodeCall(IMockV2FarmingProxy.setPausedMode, (enabled)));
  }

  function getFarmingPausedMode() external returns (bool) {
    return abi.decode(_v2Call(_v2FarmingImpl(), abi.encodeCall(IMockV2FarmingProxy.getPausedMode, ())), (bool));
  }

  function getFarmingUpdateStats() external returns (uint256 updateCount, uint256 lastUpdateTimestamp) {
    bytes memory data = abi.encodeCall(IMockV2FarmingProxy.getUpdateStats, ());
    return abi.decode(_v2Call(_v2FarmingImpl(), data), (uint256, uint256));
  }

  function hasUpgradedFarmingImpl() external returns (bool) {
    return abi.decode(_v2Call(_v2FarmingImpl(), abi.encodeCall(IMockV2FarmingProxy.isUpgradedFarmingImpl, ())), (bool));
  }
}

/// @dev Plugin level accessors for the V2 functions of MockUpgradedALMPluginImplementation.
abstract contract V2AlmAccessors is V2AccessorsBase {
  bool public constant HAS_UPGRADED_ALM = true;

  function _v2AlmImpl() internal view virtual returns (address);

  function setAlmAdvancedMode(bool enabled) external {
    _v2Authorize();
    _v2Call(_v2AlmImpl(), abi.encodeCall(IMockV2Alm.setAdvancedMode, (enabled)));
  }

  function getAlmAdvancedMode() external returns (bool) {
    return abi.decode(_v2Call(_v2AlmImpl(), abi.encodeCall(IMockV2Alm.getAdvancedMode, ())), (bool));
  }

  function hasUpgradedAlmImpl() external returns (bool) {
    return abi.decode(_v2Call(_v2AlmImpl(), abi.encodeCall(IMockV2Alm.isUpgradedAlmImpl, ())), (bool));
  }
}

/// @dev Plugin level accessors for the V2 functions of MockUpgradedSecurityPluginImplementation.
abstract contract V2SecurityAccessors is V2AccessorsBase {
  bool public constant HAS_UPGRADED_SECURITY = true;

  function _v2SecurityImpl() internal view virtual returns (address);

  function setSecurityEmergencyMode(bool enabled) external {
    _v2Authorize();
    _v2Call(_v2SecurityImpl(), abi.encodeCall(IMockV2Security.setEmergencyMode, (enabled)));
  }

  function getSecurityEmergencyMode() external returns (bool) {
    return abi.decode(_v2Call(_v2SecurityImpl(), abi.encodeCall(IMockV2Security.getEmergencyMode, ())), (bool));
  }

  function getSecurityCheckStats() external returns (uint256 checkCount, uint256 lastCheckTimestamp) {
    bytes memory data = abi.encodeCall(IMockV2Security.getCheckStats, ());
    return abi.decode(_v2Call(_v2SecurityImpl(), data), (uint256, uint256));
  }

  function hasUpgradedSecurityImpl() external returns (bool) {
    bytes memory data = abi.encodeCall(IMockV2Security.isUpgradedSecurityImpl, ());
    return abi.decode(_v2Call(_v2SecurityImpl(), data), (bool));
  }
}
