// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.20;

/// @title Mock Reflex Router (Always Reverts)
/// @notice Used to ensure Reflex integration never bricks the main swap
contract MockReflexRouterRevert {
  error MockReflexRouterRevertError();

  function triggerBackrun(bytes32, uint112, bool, address, bytes32) external pure returns (uint256, address) {
    revert MockReflexRouterRevertError();
  }
}
