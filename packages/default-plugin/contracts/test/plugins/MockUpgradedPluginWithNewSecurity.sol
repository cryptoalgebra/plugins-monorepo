// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';

/// @title Mock Upgraded Plugin with New Security Implementation
/// @notice Plugin version that uses upgraded SecurityPluginImplementation
/// @dev The security implementation address is set via constructor (immutable)
contract MockUpgradedPluginWithNewSecurity is MockTimeAlgebraUpgradeablePlugin {
  /// @dev Marker to identify this as upgraded plugin
  bool public constant HAS_UPGRADED_SECURITY = true;

  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl, // ← New security implementation!
    address _permissionedPoolImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      _permissionedPoolImpl
    )
  {}

  // ========== V2 Security Functions (exposed to plugin interface) ==========

  /// @notice Set emergency mode via delegatecall to new security impl
  function setSecurityEmergencyMode(bool enabled) external {
    _authorize();
    _delegateCall(securityImplementation, abi.encodeWithSignature('setEmergencyMode(bool)', enabled));
  }

  /// @notice Get emergency mode via staticcall
  function getSecurityEmergencyMode() external returns (bool) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('getEmergencyMode()'));
    return abi.decode(result, (bool));
  }

  /// @notice Get check statistics via staticcall
  function getSecurityCheckStats() external returns (uint256 checkCount, uint256 lastCheckTimestamp) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('getCheckStats()'));
    return abi.decode(result, (uint256, uint256));
  }

  /// @notice Check if using upgraded security impl
  function hasUpgradedSecurityImpl() external returns (bool) {
    bytes memory result = _delegateCall(securityImplementation, abi.encodeWithSignature('isUpgradedSecurityImpl()'));
    return abi.decode(result, (bool));
  }
}
