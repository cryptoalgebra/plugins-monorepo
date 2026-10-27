// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev Base for module mocks that decorate the shipped implementation
/// @dev Module functions are not virtual, so V1 is reached by delegatecall
abstract contract V1Forwarder {
  /// @dev The shipped V1 implementation, deployed from source so it cannot go stale
  address private immutable v1;

  constructor(address v1Implementation) {
    v1 = v1Implementation;
  }

  /// @dev Runs V1 in the plugin storage, since this mock is itself delegatecalled
  function _forwardToV1() internal {
    (bool success, bytes memory result) = v1.delegatecall(msg.data);
    if (!success) {
      assembly {
        revert(add(32, result), mload(result))
      }
    }
  }
}
