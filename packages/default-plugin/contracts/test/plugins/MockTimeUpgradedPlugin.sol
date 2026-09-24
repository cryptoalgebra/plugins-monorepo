// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';

/// @title Mock Time Upgraded Plugin for testing upgrades with time manipulation
/// @notice Extends MockTimeAlgebraUpgradeablePlugin to keep advanceTime() after upgrade
contract MockTimeUpgradedPlugin is MockTimeAlgebraUpgradeablePlugin {
  bool public constant HAS_UPGRADED_FARMING = true;
  bool public constant HAS_UPGRADED_SECURITY = true;
  bool public constant HAS_UPGRADED_VOLATILITY = true;

  bytes32 internal constant UPGRADE_TEST_NAMESPACE = keccak256('algebra.storage.upgradetest');

  struct UpgradeTestLayout {
    uint256 newVariable;
  }

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
    address _farmingProxyImpl,
    address _securityImpl,
    address _priceConvergenceImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _farmingProxyImpl,
      _securityImpl,
      _priceConvergenceImpl
    )
  {}

  function newUpgradeableFunction() external pure returns (uint256) {
    return 42;
  }

  function setNewVariable(uint256 value) external {
    _authorize();
    _getUpgradeTestLayout().newVariable = value;
  }

  function getNewVariable() external view returns (uint256) {
    return _getUpgradeTestLayout().newVariable;
  }

  function isUpgraded() external pure returns (bool) {
    return true;
  }

  function getVolatilityExtraData() external returns (uint256) {
    bytes memory result = _delegateCall(volatilityOracleImplementation, abi.encodeWithSignature('getExtraVolatilityData()'));
    return abi.decode(result, (uint256));
  }

  function hasUpgradedVolatilityImpl() external returns (bool) {
    bytes memory result = _delegateCall(volatilityOracleImplementation, abi.encodeWithSignature('isUpgradedVolatilityImpl()'));
    return abi.decode(result, (bool));
  }

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
