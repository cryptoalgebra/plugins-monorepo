// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

library AbstractPluginStorage {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:algebra.storage.abstractplugin")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant NAMESPACE = 0x19d84dc05fb3c50d3b0098bed2a255f5b0b8a5c0636a4569059118df8ed92600;

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
