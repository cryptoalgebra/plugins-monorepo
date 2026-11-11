// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.26;

import '../../AlgebraUpgradeablePluginFactory.sol';

/// @title Mock factory for the upgradeable plugin factory tests
/// @notice Thin subclass of the production factory, so the tests exercise production logic
/// @dev Adds only setPluginForPool for test wiring
contract NewMockTimeUpgradeablePluginFactory is AlgebraUpgradeablePluginFactory {
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
