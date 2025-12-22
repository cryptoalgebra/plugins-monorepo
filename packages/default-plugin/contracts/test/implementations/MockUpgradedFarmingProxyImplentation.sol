// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/IAlgebraPool.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IFarmingPluginFactory.sol';
import '@cryptoalgebra/farming-proxy-plugin/contracts/interfaces/IAlgebraVirtualPool.sol';

/// @title Mock Upgraded FarmingProxy Plugin Implementation

contract MockUpgradedFarmingProxyPluginImplementation {
  using Plugins for uint8;

  bytes32 internal constant FARMING_PROXY_NAMESPACE = keccak256('algebra.storage.farmingproxy');

  struct FarmingProxyLayoutV2 {
    address incentive;
    address lastIncentiveOwner;
    // V2 fields (new)
    uint256 updateCount;
    uint256 lastUpdateTimestamp;
    bool pausedMode;
  }

  function _getFarmingProxyLayout() internal pure returns (FarmingProxyLayoutV2 storage layout) {
    bytes32 position = FARMING_PROXY_NAMESPACE;
    assembly {
      layout.slot := position
    }
  }

  //  V1 FUNCTIONS

  function initializeFarmingProxy() external {
    // Nothing to initialize for now
  }

  function setIncentive(address newIncentive, address pluginFactory, address pool) external {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();

    bool toConnect = newIncentive != address(0);
    bool accessAllowed;

    if (toConnect) {
      accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    } else {
      if (layout.lastIncentiveOwner != address(0)) accessAllowed = msg.sender == layout.lastIncentiveOwner;
      if (!accessAllowed) accessAllowed = msg.sender == IFarmingPluginFactory(pluginFactory).farmingAddress();
    }
    require(accessAllowed, 'Not allowed to set incentive');

    address currentPlugin = IAlgebraPool(pool).plugin();
    bool isPluginConnected = currentPlugin == address(this);

    if (toConnect) require(isPluginConnected, 'Plugin not attached');

    address currentIncentive = layout.incentive;
    require(currentIncentive != newIncentive, 'Already active');
    if (toConnect) require(currentIncentive == address(0), 'Has active incentive');

    layout.incentive = newIncentive;

    if (toConnect) {
      layout.lastIncentiveOwner = msg.sender;
    } else {
      layout.lastIncentiveOwner = address(0);
    }

    if (isPluginConnected) {
      (, , , uint8 currentPluginConfig, , ) = IAlgebraPool(pool).globalState();
      uint8 newPluginConfig = currentPluginConfig | uint8(Plugins.AFTER_SWAP_FLAG);
      if (currentPluginConfig != newPluginConfig) {
        IAlgebraPool(pool).setPluginConfig(newPluginConfig);
      }
    }
  }

  function isIncentiveConnected(address targetIncentive, address pool) external view returns (bool) {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();

    if (layout.incentive != targetIncentive) return false;

    address currentPlugin = IAlgebraPool(pool).plugin();
    if (currentPlugin != address(this)) return false;

    (, , , uint8 pluginConfig, , ) = IAlgebraPool(pool).globalState();
    if (!pluginConfig.hasFlag(Plugins.AFTER_SWAP_FLAG)) return false;

    return true;
  }

  function updateVirtualPoolTick(bool zeroToOne, int24 tick) external {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();
    address _incentive = layout.incentive;

    // V2: Track updates
    layout.updateCount++;
    layout.lastUpdateTimestamp = block.timestamp;

    // V2: Skip if paused
    if (layout.pausedMode) {
      return;
    }

    if (_incentive != address(0)) {
      IAlgebraVirtualPool(_incentive).crossTo(tick, zeroToOne);
    }
  }

  //  V2 NEW FUNCTIONS

  function setPausedMode(bool enabled) external {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();
    layout.pausedMode = enabled;
  }

  function getPausedMode() external view returns (bool) {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();
    return layout.pausedMode;
  }

  function getUpdateStats() external view returns (uint256 updateCount, uint256 lastUpdateTimestamp) {
    FarmingProxyLayoutV2 storage layout = _getFarmingProxyLayout();
    return (layout.updateCount, layout.lastUpdateTimestamp);
  }

  function isUpgradedFarmingImpl() external pure returns (bool) {
    return true;
  }
}
