// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.20;

import '../../AlgebraUpgradeablePluginFactory.sol';

/// @title Mock factory for the upgradeable plugin factory tests
/// @notice Thin subclass of the production factory, so the tests exercise production logic
/// @dev Adds only the ALM defaults, which IAlgebraDefaultPluginFactory declares but production does not implement yet
contract NewMockTimeUpgradeablePluginFactory is AlgebraUpgradeablePluginFactory {
  /// @custom:storage-location erc7201:algebra.mockpluginfactory.alm
  struct AlmDefaultsStorage {
    address rebalanceManager;
    uint32 slowTwapPeriod;
    uint32 fastTwapPeriod;
  }

  /// @dev Namespace erc7201:algebra.mockpluginfactory.alm
  /// @dev Slot is keccak256(abi.encode(uint256(keccak256(namespace)) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant ALM_DEFAULTS_LOCATION = 0x23c102b824d8433be3d9f7f9a48fb90413ec0eeb356a123f2df51194d4310600;

  function _getAlmDefaults() private pure returns (AlmDefaultsStorage storage s) {
    bytes32 loc = ALM_DEFAULTS_LOCATION;
    assembly {
      s.slot := loc
    }
  }

  /// @notice Default ALM rebalance manager address
  function defaultRebalanceManager() external view returns (address) {
    return _getAlmDefaults().rebalanceManager;
  }

  /// @notice Default slow TWAP period for ALM (in seconds)
  function defaultSlowTwapPeriod() external view returns (uint32) {
    return _getAlmDefaults().slowTwapPeriod;
  }

  /// @notice Default fast TWAP period for ALM (in seconds)
  function defaultFastTwapPeriod() external view returns (uint32) {
    return _getAlmDefaults().fastTwapPeriod;
  }

  /// @notice Set the default ALM rebalance manager
  function setDefaultRebalanceManager(address newRebalanceManager) external {
    _getAlmDefaults().rebalanceManager = newRebalanceManager;
    emit RebalanceManager(newRebalanceManager);
  }

  /// @notice Set the default ALM TWAP periods
  function setDefaultAlmTwapPeriods(uint32 slowPeriod, uint32 fastPeriod) external {
    if (slowPeriod < fastPeriod) revert InvalidAlmTwapPeriods();

    AlmDefaultsStorage storage s = _getAlmDefaults();
    s.slowTwapPeriod = slowPeriod;
    s.fastTwapPeriod = fastPeriod;
    emit AlmTwapPeriods(slowPeriod, fastPeriod);
  }

  /// @dev Same slot as AlgebraUpgradeablePluginFactory
  /// @dev Re-declared here so the production accessor can stay private
  /// @dev Namespace erc7201:algebra.pluginfactory.storage
  bytes32 private constant FACTORY_STORAGE_SLOT = 0x0e9f0474e886e912cb4b5069ff9005392033d95cf69dfd39d817b89628310400;

  function _getFactoryStorage() private pure returns (PluginFactoryStorage storage s) {
    bytes32 loc = FACTORY_STORAGE_SLOT;
    assembly {
      s.slot := loc
    }
  }

  /// @notice Point a pool at an arbitrary plugin (test helper)
  function setPluginForPool(address pool, address plugin) external {
    _getFactoryStorage().pluginByPool[pool] = plugin;
  }
}
