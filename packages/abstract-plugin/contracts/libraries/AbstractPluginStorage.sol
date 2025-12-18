// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

library AbstractPluginStorage {
  /// @dev Storage namespace for AbstractPlugin using ERC-7201-style namespacing.
  bytes32 internal constant NAMESPACE = keccak256('algebra.storage.abstractplugin');

  struct Layout {
    uint8 defaultPluginConfig;
    string[] activeModules;
  }

  function layout() internal pure returns (Layout storage l) {
    bytes32 position = NAMESPACE;
    assembly {
      l.slot := position
    }
  }
}
