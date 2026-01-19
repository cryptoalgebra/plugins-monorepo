// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import './MockTimeAlgebraUpgradeablePlugin.sol';

/// @title Mock Upgraded Plugin with New FarmingProxy Implementation
/// @notice Plugin version that uses upgraded FarmingProxyPluginImplementation
/// @dev The farming implementation address is set via constructor (immutable)
contract MockUpgradedPluginWithNewFarming is MockTimeAlgebraUpgradeablePlugin {
  /// @dev Marker to identify this as upgraded plugin
  bool public constant HAS_UPGRADED_FARMING = true;

  constructor(
    address _factory,
    address _pluginFactory,
    address _volatilityOracleImpl,
    address _dynamicFeeImpl,
    address _farmingProxyImpl,
    address _almImpl,
    address _securityImpl,
    address _reflexImpl,
    address _feeDiscountImpl
  )
    MockTimeAlgebraUpgradeablePlugin(
      _factory,
      _pluginFactory,
      _volatilityOracleImpl,
      _dynamicFeeImpl,
      _farmingProxyImpl,
      _almImpl,
      _securityImpl,
      _reflexImpl,
      _feeDiscountImpl
    )
  {}

  //  V2 Farming Functions

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
}
