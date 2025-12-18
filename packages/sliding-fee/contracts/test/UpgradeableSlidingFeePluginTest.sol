// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '@cryptoalgebra/integral-core/contracts/libraries/Plugins.sol';
import '@cryptoalgebra/integral-core/contracts/interfaces/pool/IAlgebraPoolState.sol';
import '@cryptoalgebra/abstract-plugin/contracts/UpgradeableAbstractPlugin.sol';

import '../SlidingFeeConnector.sol';

/// @title Upgradeable SlidingFee Plugin for Testing
/// @notice Test implementation of an upgradeable plugin using Beacon Proxy pattern with SlidingFee connector
contract UpgradeableSlidingFeePluginTest is UpgradeableAbstractPlugin, SlidingFeeConnector {
  using Plugins for uint8;

  event Fee(uint16 fee);

  /// @dev Last tick storage for fee calculation
  int24 public lastTick;

  /// @dev Last calculated fee for tests (avoids log parsing)
  uint16 public lastFee;

  /// @dev Constructor sets immutable implementation address
  /// @param _factory The Algebra factory address
  /// @param _pluginFactory The plugin factory address
  /// @param _slidingFeeImplementation The SlidingFee implementation address
  constructor(
    address _factory,
    address _pluginFactory,
    address _slidingFeeImplementation
  ) UpgradeableAbstractPlugin(_factory, _pluginFactory) SlidingFeeConnector(_slidingFeeImplementation) {}

  /// @notice Initialize the plugin for a specific pool
  /// @param _pool The pool address this plugin is attached to
  /// @param _baseFee The base fee for sliding fee calculation
  function initialize(address _pool, uint16 _baseFee) external initializer onlyPluginFactory {

    uint8 slidingFeeConfig = _initializeSlidingFee(_baseFee);
    defaultPluginConfig = defaultPluginConfig | slidingFeeConfig;

    activeModules.push('Sliding Fee Plugin');
  }

  /// @notice Test helper: compute fee for arbitrary ticks (updates factors)
  /// @dev Stores result in lastFee to avoid receipt parsing/staticCall
  function getFeeForSwap(bool zeroToOne, int24 lastTick_, int24 currentTick_) external returns (uint16 fee) {
    fee = _getFeeAndUpdateFactors(zeroToOne, currentTick_, lastTick_);
    lastFee = fee;
    emit Fee(fee);
  }

  // ###### HOOKS ######

  function beforeInitialize(
    address,
    uint160
  ) external override onlyPool returns (bytes4) {
    _updatePluginConfigInPool(defaultPluginConfig);
    return IAlgebraPlugin.beforeInitialize.selector;
  }

  function afterInitialize(
    address,
    uint160,
    int24 tick
  ) external override onlyPool returns (bytes4) {
    lastTick = tick;
    return IAlgebraPlugin.afterInitialize.selector;
  }

  function beforeSwap(
    address,
    address,
    bool zeroToOne,
    int256,
    uint160,
    bool,
    bytes calldata
  ) external override onlyPool returns (bytes4, uint24, uint24) {
    (, int24 tick, , ) = _getPoolState();
    uint16 fee = _getFeeAndUpdateFactors(zeroToOne, tick, lastTick);
    lastTick = tick;
    return (IAlgebraPlugin.beforeSwap.selector, fee, 0);
  }

  // ###### Authorization ######

  /// @dev Authorization check for SlidingFeeConnector - only ALGEBRA_BASE_PLUGIN_MANAGER
  function _authorize() internal view override(UpgradeableAbstractPlugin, BaseConnector) {
    require(IAlgebraFactory(factory).hasRoleOrOwner(ALGEBRA_BASE_PLUGIN_MANAGER, msg.sender), 'Not authorized');
  }
}
