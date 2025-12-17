// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

import '../AlgebraUpgradeablePlugin.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/libraries/VolatilityOracle.sol';
import '@cryptoalgebra/volatility-oracle-plugin/contracts/libraries/VolatilityOracleStorage.sol';

/// @title Mock upgradeable plugin for testing
/// @notice Used for testing time dependent behavior
contract MockTimeAlgebraUpgradeablePlugin is AlgebraUpgradeablePlugin {
  using VolatilityOracle for VolatilityOracle.Timepoint[65536];

  // Monday, October 5, 2020 9:00:00 AM GMT-05:00
  uint256 public time = 1601906400;

  struct UpdateParams {
    uint32 advanceTimeBy;
    int24 tick;
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

  function advanceTime(uint256 by) external {
    unchecked {
      time += by;
    }
  }

  function _blockTimestamp() internal view override(AlgebraUpgradeablePlugin) returns (uint32) {
    return uint32(time);
  }

  function checkBlockTimestamp() external view returns (bool) {
    require(super._blockTimestamp() == uint32(block.timestamp));
    return true;
  }

  /// @notice Batch update timepoints for testing filled oracle
  function batchUpdate(UpdateParams[] calldata params) external {
    VolatilityOracleStorage.Layout storage layout = VolatilityOracleStorage.layout();

    uint16 _index = layout.timepointIndex;
    uint32 _time = uint32(time);

    // Get last tick from the last timepoint
    int24 _tick = layout.timepoints[_index].tick;

    unchecked {
      for (uint256 i; i < params.length; ++i) {
        _time += params[i].advanceTimeBy;
        (_index, ) = layout.timepoints.write(_index, _time, _tick);
        _tick = params[i].tick;
      }
    }

    // Update storage
    layout.timepointIndex = _index;
    layout.lastTimepointTimestamp = _time;
    time = _time;
  }
}
