// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';

/// @title Mock Super Upgraded Plugin - ALL Modules V2
/// @notice Plugin with ALL upgraded implementations for comprehensive testing
/// @dev Tests that all modules can be upgraded simultaneously without conflicts
contract MockSuperUpgradedPlugin is MockTimeAlgebraUpgradeablePlugin {
  // Markers for each upgraded module
  bool public constant HAS_UPGRADED_VOLATILITY = true;
  bool public constant HAS_UPGRADED_DYNAMIC_FEE = true;
  bool public constant HAS_UPGRADED_FARMING = true;
  bool public constant HAS_UPGRADED_ALM = true;
  bool public constant HAS_UPGRADED_SECURITY = true;

  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl, // ← V2 VolatilityOracle
    address _dynamicFeeImpl, // ← V2 DynamicFee
    address _farmingProxyImpl, // ← V2 FarmingProxy
    address _almImpl, // ← V2 ALM
    address _securityImpl, // ← V2 Security
    address _kycImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      _kycImpl
    )
  {}

  // ========== V2 VOLATILITY ORACLE FUNCTIONS ==========

  function getVolatilityExtraData() external returns (uint256) {
    bytes memory result = _delegateCall(volatilityOracleImplementation, abi.encodeWithSignature('getExtraVolatilityData()'));
    return abi.decode(result, (uint256));
  }

  function hasUpgradedVolatilityImpl() external returns (bool) {
    bytes memory result = _delegateCall(volatilityOracleImplementation, abi.encodeWithSignature('isUpgradedVolatilityImpl()'));
    return abi.decode(result, (bool));
  }

  // ========== V2 DYNAMIC FEE FUNCTIONS ==========

  function setAdvancedFeeMode(bool enabled) external {
    _authorize();
    _delegateCall(
      dynamicFeeImplementation,
      abi.encodeWithSignature('setAdvancedMode(bool)', enabled) // ← ИСПРАВЛЕНО
    );
  }

  function getAdvancedFeeMode() external returns (bool) {
    bytes memory result = _delegateCall(
      dynamicFeeImplementation,
      abi.encodeWithSignature('getAdvancedMode()') // ← БЫЛО getAdvancedFeeMode()
    );
    return abi.decode(result, (bool));
  }

  function hasUpgradedDynamicFeeImpl() external returns (bool) {
    bytes memory result = _delegateCall(dynamicFeeImplementation, abi.encodeWithSignature('isUpgradedDynamicFeeImpl()'));
    return abi.decode(result, (bool));
  }

  // ========== V2 FARMING PROXY FUNCTIONS ==========

  function setFarmingPausedMode(bool enabled) external {
    _authorize();
    _delegateCall(farmingProxyImplementation, abi.encodeWithSignature('setPausedMode(bool)', enabled));
  }

  function getFarmingPausedMode() external returns (bool) {
    bytes memory result = _delegateCall(farmingProxyImplementation, abi.encodeWithSignature('getPausedMode()'));
    return abi.decode(result, (bool));
  }

  function getFarmingUpdateStats() external returns (uint256 updateCount, uint256 lastUpdateTimestamp) {
    bytes memory result = _delegateCall(farmingProxyImplementation, abi.encodeWithSignature('getUpdateStats()'));
    return abi.decode(result, (uint256, uint256));
  }

  function hasUpgradedFarmingImpl() external returns (bool) {
    bytes memory result = _delegateCall(farmingProxyImplementation, abi.encodeWithSignature('isUpgradedFarmingImpl()'));
    return abi.decode(result, (bool));
  }

  // ========== V2 ALM FUNCTIONS ==========

  function setAlmAdvancedMode(bool enabled) external {
    _authorize();
    _delegateCall(almImplementation, abi.encodeWithSignature('setAdvancedMode(bool)', enabled));
  }

  function getAlmAdvancedMode() external returns (bool) {
    bytes memory result = _delegateCall(almImplementation, abi.encodeWithSignature('getAdvancedMode()'));
    return abi.decode(result, (bool));
  }

  function getAlmRebalanceStats() external returns (uint256 rebalanceCount, uint256 lastRebalanceTime) {
    bytes memory result = _delegateCall(almImplementation, abi.encodeWithSignature('getRebalanceStats()'));
    return abi.decode(result, (uint256, uint256));
  }

  function hasUpgradedAlmImpl() external returns (bool) {
    bytes memory result = _delegateCall(almImplementation, abi.encodeWithSignature('isUpgradedAlmImpl()'));
    return abi.decode(result, (bool));
  }

  // ========== V2 SECURITY FUNCTIONS ==========

  function setSecurityEmergencyMode(bool enabled) external {
    _authorize();
    _delegateCall(securityImplementation, abi.encodeWithSignature('setEmergencyMode(bool)', enabled));
  }

  function getSecurityEmergencyMode() external returns (bool) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('getEmergencyMode()'));
    return abi.decode(result, (bool));
  }

  function getSecurityCheckStats() external returns (uint256 checkCount, uint256 lastCheckTimestamp) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('getCheckStats()'));
    return abi.decode(result, (uint256, uint256));
  }

  function hasUpgradedSecurityImpl() external returns (bool) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('isUpgradedSecurityImpl()'));
    return abi.decode(result, (bool));
  }
}
