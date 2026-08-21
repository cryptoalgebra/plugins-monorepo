// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @dev Base for module mocks that decorate the shipped implementation instead of reimplementing it.
/// @dev Needed because the module implementations are not virtual, so V1 cannot be reached by an override.
abstract contract V1Forwarder {
  /// @dev V1 logic this mock decorates, deploy it from the shipped source so it can never point at stale code
  address private immutable v1;

  constructor(address v1Implementation) {
    v1 = v1Implementation;
  }

  /// @dev Runs V1 in the caller storage context, this contract is itself reached by delegatecall from the plugin
  function _forwardToV1() internal {
    (bool success, bytes memory result) = v1.delegatecall(msg.data);
    if (!success) {
      assembly {
        revert(add(32, result), mload(result))
      }
    }
  }
}
