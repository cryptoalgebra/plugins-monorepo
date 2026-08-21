// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/FarmingProxyPluginImplementation.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingProxyPluginImplementation.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/libraries/FarmingProxyStorage.sol';

import './libraries/MockV2Storage.sol';
import './mixins/V1Forwarder.sol';
import '../interfaces/IMockV2Modules.sol';

/// @title Mock Upgraded FarmingProxy Plugin Implementation
/// @notice Decorates the shipped module, V1 calls are forwarded instead of reimplemented
/// @dev Implements both module interfaces explicitly, so a change in either breaks this mock at compile time
contract MockUpgradedFarmingProxyPluginImplementation is
  IFarmingProxyPluginImplementation,
  IMockV2FarmingProxy,
  V1Forwarder
{
  using Plugins for uint8;

  constructor() V1Forwarder(address(new FarmingProxyPluginImplementation())) {}

  function setIncentive(address, address, address) external {
    _forwardToV1();
  }

  function updateVirtualPoolTick(bool, int24) external {
    MockV2Storage.FarmingLayout storage s = MockV2Storage.farming();
    s.updateCount++;
    s.lastUpdateTimestamp = block.timestamp;

    // V2: the virtual pool is left untouched while farming is paused
    if (s.pausedMode) return;

    _forwardToV1();
  }

  /// @dev View functions cannot delegatecall, so this one reads the shared namespace directly
  function isIncentiveConnected(address targetIncentive, address pool) external view returns (bool) {
    if (FarmingProxyStorage.layout().incentive != targetIncentive) return false;
    if (IAlgebraPool(pool).plugin() != address(this)) return false;

    (, , , uint8 pluginConfig, , ) = IAlgebraPool(pool).globalState();
    return pluginConfig.hasFlag(Plugins.AFTER_SWAP_FLAG);
  }

  // V2 additions

  function setPausedMode(bool enabled) external {
    MockV2Storage.farming().pausedMode = enabled;
  }

  function getPausedMode() external view returns (bool) {
    return MockV2Storage.farming().pausedMode;
  }

  function getUpdateStats() external view returns (uint256 updateCount, uint256 lastUpdateTimestamp) {
    MockV2Storage.FarmingLayout storage s = MockV2Storage.farming();
    return (s.updateCount, s.lastUpdateTimestamp);
  }

  function isUpgradedFarmingImpl() external pure returns (bool) {
    return true;
  }
}
